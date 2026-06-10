import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  locationRequiredError,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { renderAndStoreContractPdf } from "@/lib/portal/pdf-flow";
import { bustContracts } from "@/lib/portal/revalidate";

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
  const locErr = locationRequiredError(contract);
  if (locErr) {
    return NextResponse.json({ ok: false, error: locErr }, { status: 409 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { ok: false, error: "Vercel Blob není nakonfigurován." },
      { status: 500 },
    );
  }

  let uploaded;
  try {
    uploaded = await renderAndStoreContractPdf(contract);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[contracts] PDF generation failed", { id, err });
    return NextResponse.json(
      { ok: false, error: `Generování PDF selhalo: ${detail}` },
      { status: 500 },
    );
  }

  const updated = {
    ...contract,
    generatedPdfUrl: uploaded.url,
    generatedPdfPath: uploaded.path,
    generatedAt: uploaded.generatedAt,
    updatedAt: uploaded.generatedAt,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true, url: uploaded.url });
}
