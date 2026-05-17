import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireSession } from "@/lib/portal/auth-guard";
import { getContract, upsertContract } from "@/lib/portal/contracts-db";

export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { ok: false, error: "Vercel Blob není nakonfigurován." },
      { status: 500 },
    );
  }

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Soubor chybí." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "Prázdný soubor." },
      { status: 400 },
    );
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "Soubor je větší než 25 MB." },
      { status: 400 },
    );
  }

  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return NextResponse.json(
      { ok: false, error: "Nahrávejte prosím PDF." },
      { status: 400 },
    );
  }

  const safeName = slugify(file.name);
  const path = `portal/contracts/${contract.id}/scans/${Date.now()}-${safeName}`;

  let uploaded;
  try {
    uploaded = await put(path, file, {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (err) {
    console.error("[contracts] scan upload failed", {
      path,
      message: err instanceof Error ? err.message : String(err),
      err,
    });
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Nahrání skenu selhalo: ${detail}` },
      { status: 500 },
    );
  }

  // Replace old scan if exists
  if (contract.scanPdfPath && contract.scanPdfPath !== uploaded.pathname) {
    try {
      await del(contract.scanPdfPath);
    } catch (err) {
      console.error("[contracts] old scan delete failed", err);
    }
  }

  const now = new Date().toISOString();
  await upsertContract({
    ...contract,
    status: "archived",
    scanPdfUrl: uploaded.url,
    scanPdfPath: uploaded.pathname,
    scanUploadedAt: now,
    scanUploadedBy: g.session.user!.email!,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true, url: uploaded.url });
}

export async function DELETE(
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

  if (contract.scanPdfPath) {
    try {
      await del(contract.scanPdfPath);
    } catch (err) {
      console.error("[contracts] scan delete failed", err);
    }
  }

  const status = contract.generatedPdfUrl ? "generated" : "draft";
  await upsertContract({
    ...contract,
    status,
    scanPdfUrl: undefined,
    scanPdfPath: undefined,
    scanUploadedAt: undefined,
    scanUploadedBy: undefined,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
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
  return stripped.slice(0, 100) || "scan.pdf";
}
