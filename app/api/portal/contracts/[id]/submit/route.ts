import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { isApprovalGated } from "@/lib/portal/contract-types";
import { evaluateApprovalForContract } from "@/lib/portal/contract-approval";
import { getLocation, toLocationSnapshot } from "@/lib/portal/locations-db";
import { bustContracts } from "@/lib/portal/revalidate";

// Odeslání smlouvy ke schválení (Koncept → Ke schválení / Schváleno). Vyhodnotí
// klíč nad lokalitou (snapshot + NewCo) a částkami z textu: splňuje vše →
// rovnou Schváleno (auto), jinak → Ke schválení s uloženými důvody.
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

  // Vyhodnocení proti AKTUÁLNÍM datům z Transition: smlouva je v konceptu (není
  // schválená), takže snapshot lokality čerstvě obnovíme z živého zrcadla. Tím
  // se promítne případná oprava dat v Transition + synchronizace.
  const loc = await getLocation(contract.locationId);
  const base = loc
    ? { ...contract, locationSnapshot: toLocationSnapshot(loc, now) }
    : contract;
  const nc = loc?.local?.newco;
  const newco = nc
    ? { inFile: true, entitaCeip1: nc.entitaCeip1, operationalType: nc.operationalType }
    : null;

  const { auto, reasons } = evaluateApprovalForContract(base, newco);

  const updated = {
    ...base,
    submittedForApprovalAt: now,
    submittedForApprovalBy: email,
    // Splňuje vše → projde stavem Ke schválení rovnou do Schváleno.
    ...(auto
      ? {
          approvalDecision: "auto" as const,
          approvedAt: now,
          approvedBy: email,
        }
      : {
          approvalDecision: "manual" as const,
          approvalReasons: reasons.map((r) => r.label),
        }),
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({
    ok: true,
    auto,
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
    approvalReasons: _reasons,
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
  void _sub; void _subBy; void _dec; void _rule; void _reasons; void _a; void _ab;
  void _se; void _sp; void _spb; void _sa; void _sb; void _cs; void _csb;

  const updated = { ...rest, updatedAt: new Date().toISOString() };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
