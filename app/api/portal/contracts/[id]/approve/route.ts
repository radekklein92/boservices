import { NextResponse } from "next/server";
import { isAdminRole, requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import {
  isApprovalGated,
  requiresAdminToApproveDraft,
} from "@/lib/portal/contract-types";
import { getUser } from "@/lib/portal/users-db";
import { bustContracts } from "@/lib/portal/revalidate";

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

  // Odstoupení a Postoupení smí z konceptu schválit pouze administrátor.
  if (
    requiresAdminToApproveDraft(contract.type) &&
    !isAdminRole(g.session.user?.role)
  ) {
    return NextResponse.json(
      { ok: false, error: "Tento typ smlouvy smí schválit pouze administrátor." },
      { status: 403 },
    );
  }

  // Volitelná poznámka schvalovatele (např. „schváleno telefonicky …").
  let note: string | undefined;
  try {
    const body = (await req.json()) as { note?: unknown };
    if (typeof body?.note === "string" && body.note.trim()) {
      note = body.note.trim().slice(0, 500);
    }
  } catch {
    // bez těla - poznámka prostě není
  }

  const email = g.session.user!.email!;
  const senderName = g.session.user?.name?.trim();
  const now = new Date().toISOString();

  // Typy posuzované podle lokality: ze stavu Ke schválení může schválit
  // schvalovatel šablon, nebo superadmin. Schvalovatel poznámku psát nemusí;
  // superadmin (mimo standardní proces) musí uvést podrobnou poznámku (proč,
  // kdy a kým byla smlouva schválena). Auto-schválené sem nechodí.
  let extra: Partial<typeof contract> = {};
  if (isApprovalGated(contract.type)) {
    if (contract.status !== "ke-schvaleni") {
      return NextResponse.json(
        { ok: false, error: "Smlouva není ve stavu Ke schválení." },
        { status: 409 },
      );
    }
    const me = await getUser(email);
    const isApprover = !!me?.isTemplateApprover;
    const isSuperadmin = me?.role === "superadmin";
    if (!isApprover && !isSuperadmin) {
      return NextResponse.json(
        { ok: false, error: "Schválit může schvalovatel šablon nebo superadmin." },
        { status: 403 },
      );
    }
    if (!isApprover && !note) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Jako superadmin uveďte poznámku (proč, kdy a kým byla smlouva schválena).",
        },
        { status: 400 },
      );
    }
    extra = { approvalDecision: "manual" };
  }

  // Finální PDF (bez watermarku) se generuje až v kroku „K podpisu" / „Připravit
  // k podpisu" (pick-signer) pro všechny typy - při schválení tedy negenerujeme.
  const updated = {
    ...contract,
    ...extra,
    // Negated typy (NDA, odstoupení, postoupení…) jdou z Konceptu rovnou na
    // Schváleno - schvalovatel je zároveň ten, kdo smlouvu poslal z konceptu.
    // Zaznamenáme to do submittedForApproval* (timeline + převzetí odpovědnosti).
    ...(isApprovalGated(contract.type)
      ? {}
      : {
          submittedForApprovalAt: now,
          submittedForApprovalBy: email,
          ...(senderName ? { submittedForApprovalByName: senderName } : {}),
        }),
    approvedAt: now,
    approvedBy: email,
    ...(note ? { approvalNote: note } : {}),
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
    submittedForApprovalAt: _sa2,
    submittedForApprovalBy: _sb2,
    submittedForApprovalByName: _sn2,
    signerEmail: _se,
    signerPickedAt: _sp,
    signerPickedBy: _spb,
    signedAt: _sa,
    signedBy: _sb,
    clientSignedAt: _cs,
    clientSignedBy: _csb,
    ...rest
  } = contract;
  void _a; void _ab; void _sa2; void _sb2; void _sn2; void _se; void _sp; void _spb;
  void _sa; void _sb; void _cs; void _csb;
  const updated = {
    ...rest,
    // Gated: rollback vede zpět na „Ke schválení" - údaj o odeslání z konceptu
    // musí zůstat. Negated: vede do Konceptu, takže ho mažeme (viz destructuring).
    ...(isApprovalGated(contract.type)
      ? {
          submittedForApprovalAt: contract.submittedForApprovalAt,
          submittedForApprovalBy: contract.submittedForApprovalBy,
          ...(contract.submittedForApprovalByName
            ? { submittedForApprovalByName: contract.submittedForApprovalByName }
            : {}),
        }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
