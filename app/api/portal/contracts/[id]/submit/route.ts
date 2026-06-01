import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { isApprovalGated } from "@/lib/portal/contract-types";
import { evaluateAutoApproval } from "@/lib/portal/contract-approval";
import { bustContracts } from "@/lib/portal/revalidate";

// Odeslání smlouvy ke schválení (Koncept → Ke schválení / Schváleno). Vyhodnotí
// klíč nad locationSnapshot: auto (pravidlo 1/2) → rovnou Schváleno, jinak
// (pravidlo 3) → Ke schválení a čeká na schvalovatele.
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
  if (!isApprovalGated(contract.type)) {
    return NextResponse.json(
      { ok: false, error: "Tento typ smlouvy se ke schválení neodesílá." },
      { status: 400 },
    );
  }
  if (!contract.locationId || !contract.locationSnapshot) {
    return NextResponse.json(
      { ok: false, error: "Nejdřív vyberte lokalitu." },
      { status: 400 },
    );
  }
  if (contract.status !== "koncept") {
    return NextResponse.json(
      { ok: false, error: "Smlouva už byla odeslána ke schválení." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const email = g.session.user!.email!;
  const autoRule = evaluateAutoApproval(contract.locationSnapshot);

  const updated = {
    ...contract,
    submittedForApprovalAt: now,
    submittedForApprovalBy: email,
    // Auto (pravidlo 1/2): projde stavem Ke schválení rovnou do Schváleno.
    ...(autoRule
      ? {
          approvalDecision: "auto" as const,
          approvalRule: autoRule,
          approvedAt: now,
          approvedBy: email,
        }
      : {
          approvalDecision: "manual" as const,
          approvalRule: 3 as const,
        }),
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({
    ok: true,
    auto: autoRule !== null,
    rule: autoRule ?? 3,
    status: updated.status,
  });
}

// Vrátit do konceptu - zruší odeslání i případné navazující kroky.
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
    submittedForApprovalAt: _sub,
    submittedForApprovalBy: _subBy,
    approvalDecision: _dec,
    approvalRule: _rule,
    approvedAt: _a,
    approvedBy: _ab,
    signerEmail: _se,
    signerPickedAt: _sp,
    signerPickedBy: _spb,
    signedAt: _sa,
    signedBy: _sb,
    clientSignedAt: _cs,
    clientSignedBy: _csb,
    ...rest
  } = contract;
  void _sub; void _subBy; void _dec; void _rule; void _a; void _ab;
  void _se; void _sp; void _spb; void _sa; void _sb; void _cs; void _csb;

  const updated = { ...rest, updatedAt: new Date().toISOString() };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
