import { NextResponse } from "next/server";
import { z } from "zod";
import { del } from "@vercel/blob";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  deleteContract,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";

const updateSchema = z.object({
  html: z.string().max(200_000).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  number: z.string().trim().max(40).optional(),
});

export async function GET(
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
  return NextResponse.json({ ok: true, contract });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const existing = await getContract(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed" }, { status: 400 });
  }

  const updated = {
    ...existing,
    html: parsed.data.html ?? existing.html,
    variables: parsed.data.variables
      ? { ...existing.variables, ...parsed.data.variables }
      : existing.variables,
    number: parsed.data.number ?? existing.number,
    // Editing invalidates the previously generated PDF
    generatedPdfUrl: undefined,
    generatedPdfPath: undefined,
    generatedAt: undefined,
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const contract = await deleteContract(id);
  if (!contract) {
    return NextResponse.json({ ok: true });
  }

  // Best-effort cleanup of Blob files
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const paths: string[] = [];
    if (contract.generatedPdfPath) paths.push(contract.generatedPdfPath);
    if (contract.scanPdfPath) paths.push(contract.scanPdfPath);
    if (paths.length) {
      try {
        await del(paths);
      } catch (err) {
        console.error("[contracts] blob delete failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
