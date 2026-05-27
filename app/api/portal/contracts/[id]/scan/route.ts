import { NextResponse } from "next/server";
import { z } from "zod";
import { head, del } from "@vercel/blob";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustContracts } from "@/lib/portal/revalidate";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";

export const maxDuration = 60;

// Sken nahrává prohlížeč přímo do Vercel Blob (viz /scan-upload), čímž se obejde
// 4,5 MB limit těla serverless funkce. Tento endpoint jen zaeviduje hotový blob
// na smlouvu a archivuje ji - tělo je malé JSON, žádný limit nevadí.
const recordSchema = z.object({
  url: z.string().url(),
  pathname: z.string().min(1).max(500),
});

export async function POST(
  req: Request,
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = recordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Chybí údaje o skenu." },
      { status: 400 },
    );
  }
  const { url, pathname } = parsed.data;

  // Sken musí patřit této smlouvě - klient nemůže podstrčit cizí blob.
  if (!pathname.startsWith(`portal/contracts/${id}/scans/`)) {
    return NextResponse.json(
      { ok: false, error: "Neplatná cesta skenu." },
      { status: 400 },
    );
  }

  // Ověřit, že nahraný blob existuje a je PDF.
  try {
    const info = await head(pathname);
    if (info.contentType && !info.contentType.includes("pdf")) {
      try {
        await del(pathname);
      } catch {
        // ignore
      }
      return NextResponse.json(
        { ok: false, error: "Nahrávejte prosím PDF." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Nahraný sken nebyl nalezen." },
      { status: 400 },
    );
  }

  // Smazat starý sken, pokud byl jiný.
  if (contract.scanPdfPath && contract.scanPdfPath !== pathname) {
    try {
      await del(contract.scanPdfPath);
    } catch (err) {
      console.error("[contracts] old scan delete failed", err);
    }
  }

  const now = new Date().toISOString();
  const updated = {
    ...contract,
    scanPdfUrl: url,
    scanPdfPath: pathname,
    scanUploadedAt: now,
    scanUploadedBy: g.session.user!.email!,
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true, url });
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

  const updated = {
    ...contract,
    scanPdfUrl: undefined,
    scanPdfPath: undefined,
    scanUploadedAt: undefined,
    scanUploadedBy: undefined,
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
