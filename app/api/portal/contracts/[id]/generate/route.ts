import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireSession } from "@/lib/portal/auth-guard";
import { getContract, upsertContract } from "@/lib/portal/contracts-db";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
import { renderTemplate } from "@/lib/portal/contract-render";
import { htmlToPdfBuffer } from "@/lib/portal/pdf-generator";
import { getCoverForType } from "@/lib/portal/pdf-styles";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { ok: false, error: "Vercel Blob není nakonfigurován." },
      { status: 500 },
    );
  }

  const rendered = renderTemplate(contract.html, contract.variables);
  const meta = CONTRACT_TYPE_META[contract.type];
  const title = `${meta.shortName} - ${contract.clientName}`;
  const cover = getCoverForType(contract.type);

  let pdf: Buffer;
  try {
    pdf = await htmlToPdfBuffer(rendered, { type: contract.type, cover });
  } catch (err) {
    console.error("[contracts] PDF render failed", err);
    return NextResponse.json(
      { ok: false, error: "Generování PDF selhalo." },
      { status: 500 },
    );
  }

  const safeName = slugify(title);
  const path = `portal/contracts/${contract.id}/generated/${Date.now()}-${safeName}.pdf`;

  let uploaded;
  try {
    uploaded = await put(path, pdf, {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (err) {
    console.error("[contracts] Blob upload failed", {
      path,
      message: err instanceof Error ? err.message : String(err),
      err,
    });
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Nahrání PDF do Vercel Blobu selhalo: ${detail}` },
      { status: 500 },
    );
  }

  const now = new Date().toISOString();
  await upsertContract({
    ...contract,
    status: contract.status === "archived" ? "archived" : "generated",
    generatedPdfUrl: uploaded.url,
    generatedPdfPath: uploaded.pathname,
    generatedAt: now,
    updatedAt: now,
  });

  return NextResponse.json({
    ok: true,
    url: uploaded.url,
  });
}

const DIACRITICS: Record<string, string> = {
  á: "a", č: "c", ď: "d", é: "e", ě: "e", í: "i", ň: "n",
  ó: "o", ř: "r", š: "s", ť: "t", ú: "u", ů: "u", ý: "y", ž: "z",
  Á: "A", Č: "C", Ď: "D", É: "E", Ě: "E", Í: "I", Ň: "N",
  Ó: "O", Ř: "R", Š: "S", Ť: "T", Ú: "U", Ů: "U", Ý: "Y", Ž: "Z",
};

function slugify(input: string): string {
  const stripped = Array.from(input)
    .map((ch) => DIACRITICS[ch] ?? ch)
    .join("")
    .replace(/[^a-zA-Z0-9.\-_\s]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return stripped.slice(0, 100) || "contract";
}
