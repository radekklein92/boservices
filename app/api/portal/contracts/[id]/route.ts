import { NextResponse } from "next/server";
import { z } from "zod";
import { del } from "@vercel/blob";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  deleteContract,
  getContract,
  upsertContract,
  type BundleSection,
} from "@/lib/portal/contracts-db";
import { isClaimBundleSection } from "@/lib/portal/contract-types";
import { bustContracts } from "@/lib/portal/revalidate";

const bundleSectionSchema = z.object({
  type: z.string().refine(isClaimBundleSection, {
    message: "Neplatný typ sekce balíčku.",
  }),
  html: z.string().max(200_000),
});

const claimSchema = z.object({
  id: z.string().max(100),
  origin: z.enum(["kupni", "fransizingova", "manazerska", "jina"]),
  originOther: z.string().max(300).optional(),
  originDate: z.string().max(60).optional(),
  legalTitleType: z
    .enum(["unjust-equipment", "unjust-fee", "profit", "other"])
    .optional(),
  legalTitleProfitPeriod: z.string().max(120).optional(),
  legalTitleOther: z.string().max(1000).optional(),
  legalTitle: z.string().max(1000).optional(),
  amount: z.string().max(60),
  invoiceNumber: z.string().max(120).optional(),
  dueDate: z.string().max(120).optional(),
  note: z.string().max(1000).optional(),
});

const updateSchema = z.object({
  html: z.string().max(200_000).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  number: z.string().trim().max(40).optional(),
  bundleSections: z.array(bundleSectionSchema).optional(),
  claims: z.array(claimSchema).max(200).optional(),
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

  // Sloučit variables a auto-sync effectiveDate = contractDate
  const mergedVars = parsed.data.variables
    ? { ...existing.variables, ...parsed.data.variables }
    : existing.variables;
  if (mergedVars.contractDate) {
    mergedVars.effectiveDate = mergedVars.contractDate;
  }
  // Číslo smlouvy se nemění - zachovat z existing
  mergedVars.contractNumber = existing.number ?? existing.variables.contractNumber ?? "";

  // Bundle: merge příchozí bundleSections do existujících podle type.
  // Snapshot zachováme (mění se jen při vytvoření / přepnutí varianty).
  let nextBundleSections: BundleSection[] | undefined = existing.bundleSections;
  if (parsed.data.bundleSections && existing.bundleSections) {
    const byType = new Map(
      parsed.data.bundleSections.map((s) => [s.type, s.html]),
    );
    nextBundleSections = existing.bundleSections.map((s) => ({
      ...s,
      html: byType.get(s.type) ?? s.html,
    }));
  }

  const updated = {
    ...existing,
    html: parsed.data.html ?? existing.html,
    bundleSections: nextBundleSections,
    variables: mergedVars,
    claims: parsed.data.claims ?? existing.claims,
    number: existing.number,
    // Editing invalidates the previously generated PDF
    generatedPdfUrl: undefined,
    generatedPdfPath: undefined,
    generatedAt: undefined,
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);
  bustContracts();
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
    bustContracts();
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

  bustContracts();
  return NextResponse.json({ ok: true });
}
