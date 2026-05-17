import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireSession } from "@/lib/portal/auth-guard";
import { getContract } from "@/lib/portal/contracts-db";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";

export const maxDuration = 60;

const DIACRITICS: Record<string, string> = {
  á: "a", č: "c", ď: "d", é: "e", ě: "e", í: "i", ň: "n",
  ó: "o", ř: "r", š: "s", ť: "t", ú: "u", ů: "u", ý: "y", ž: "z",
  Á: "A", Č: "C", Ď: "D", É: "E", Ě: "E", Í: "I", Ň: "N",
  Ó: "O", Ř: "R", Š: "S", Ť: "T", Ú: "U", Ů: "U", Ý: "Y", Ž: "Z",
};

function slugify(s: string): string {
  return Array.from(s)
    .map((ch) => DIACRITICS[ch] ?? ch)
    .join("")
    .replace(/[^a-zA-Z0-9.\-_]/g, "-")
    .replace(/-+/g, "-");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id, kind } = await params;
  if (kind !== "generated" && kind !== "scan") {
    return NextResponse.json({ ok: false, error: "Unknown kind" }, { status: 400 });
  }

  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const path =
    kind === "scan" ? contract.scanPdfPath : contract.generatedPdfPath;
  if (!path) {
    return NextResponse.json({ ok: false, error: "Soubor neexistuje." }, { status: 404 });
  }

  try {
    const result = await get(path, { access: "private" });
    if (!result?.stream) {
      return NextResponse.json(
        { ok: false, error: "Blob nelze otevřít." },
        { status: 500 },
      );
    }

    const meta = CONTRACT_TYPE_META[contract.type];
    const filename = slugify(
      `${meta.shortName}-${contract.clientName}${kind === "scan" ? "-sken" : ""}.pdf`,
    );
    const dispositionMode =
      req.headers.get("x-download") === "1" ? "attachment" : "inline";

    return new Response(result.stream as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${dispositionMode}; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    console.error("[contracts] download failed", {
      path,
      message: err instanceof Error ? err.message : String(err),
    });
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Stažení selhalo: ${detail}` },
      { status: 500 },
    );
  }
}
