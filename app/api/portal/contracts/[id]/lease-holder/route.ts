import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  isContractEditable,
  upsertContract,
} from "@/lib/portal/contracts-db";
import {
  applySubleaseClause,
  isLeaseHolderKey,
} from "@/lib/portal/lease-holders";
import { bustContracts } from "@/lib/portal/revalidate";

const bodySchema = z.object({
  // null = zpět na základní znění (Poskytovatel)
  company: z.union([z.literal("operations"), z.literal("21consult"), z.null()]),
});

// Nastaví firmu držící nájem („na třetí stranu") u franšízové smlouvy varianty B
// a přepíše čl. III odst. 1 v zapečeném znění (podnájem). null = základní znění.
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
  if (contract.type !== "franchise" || contract.variant !== "B") {
    return NextResponse.json(
      { ok: false, error: "Výběr firmy je jen u franšízové smlouvy varianty B." },
      { status: 400 },
    );
  }
  if (!isContractEditable(contract.status)) {
    return NextResponse.json(
      { ok: false, error: "Schválenou smlouvu už nelze upravovat." },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Neplatný vstup." }, { status: 400 });
  }
  const key =
    parsed.data.company && isLeaseHolderKey(parsed.data.company)
      ? parsed.data.company
      : null;

  const now = new Date().toISOString();
  const updated = {
    ...contract,
    variables: { ...contract.variables, leaseHolderCompany: key ?? "" },
    html: applySubleaseClause(contract.html, key),
    // Přepis textu zneplatní vygenerované PDF (vynutí přegenerování).
    generatedPdfUrl: undefined,
    generatedPdfPath: undefined,
    generatedAt: undefined,
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
