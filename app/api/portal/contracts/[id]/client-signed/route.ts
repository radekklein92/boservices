import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustContracts } from "@/lib/portal/revalidate";
import {
  computeContractStatus,
  getContract,
  locationRequiredError,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { ensureContractFeeTerms } from "@/lib/portal/contract-fee-ai";

// AI extrakce poplatků při podpisu může trvat několik sekund (Claude přes text
// smlouvy) - povolíme delší běh než výchozí limit.
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

  const now = new Date().toISOString();
  const updated = {
    ...contract,
    clientSignedAt: now,
    clientSignedBy: g.session.user!.email!,
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  // Poplatky ze smlouvy (AI) - jen approval-gated typy, idempotentní a best-effort:
  // selhání NEzablokuje podpis (uloží feeTermsError, cron/tlačítko zkusí znovu).
  await ensureContractFeeTerms(updated);

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
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const {
    clientSignedAt: _cs,
    clientSignedBy: _csb,
    ...rest
  } = contract;
  void _cs; void _csb;
  const updated = {
    ...rest,
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
