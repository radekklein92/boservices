import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { isApprovalGated } from "@/lib/portal/contract-types";
import { getUser } from "@/lib/portal/users-db";
import { bustContracts } from "@/lib/portal/revalidate";

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

  const email = g.session.user!.email!;
  const now = new Date().toISOString();

  // Typy posuzované podle lokality: ze stavu Ke schválení (pravidlo 3) může
  // schválit jen schvalovatel šablon. Auto-schválené sem nechodí (projdou rovnou
  // do Schváleno v kroku „Odeslat ke schválení").
  let extra: Partial<typeof contract> = {};
  if (isApprovalGated(contract.type)) {
    if (contract.status !== "ke-schvaleni") {
      return NextResponse.json(
        { ok: false, error: "Smlouva není ve stavu Ke schválení." },
        { status: 409 },
      );
    }
    const me = await getUser(email);
    if (!me?.isTemplateApprover) {
      return NextResponse.json(
        { ok: false, error: "Schválit může pouze schvalovatel šablon." },
        { status: 403 },
      );
    }
    extra = { approvalDecision: "manual", approvalRule: 3 };
  }

  // Finální PDF (bez watermarku) se generuje až v kroku „K podpisu" / „Připravit
  // k podpisu" (pick-signer) pro všechny typy - při schválení tedy negenerujeme.
  const updated = {
    ...contract,
    ...extra,
    approvedAt: now,
    approvedBy: email,
    updatedAt: now,
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
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Rollback Schváleno: zruší taky vše navazující, aby status flow byl konzistentní.
  const {
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
  void _a; void _ab; void _se; void _sp; void _spb;
  void _sa; void _sb; void _cs; void _csb;
  const updated = {
    ...rest,
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
