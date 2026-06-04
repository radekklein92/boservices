import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { getContract } from "@/lib/portal/contracts-db";
import { getTemplateApprovers } from "@/lib/portal/users-db";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
import {
  LEASE_HOLDER_LABEL,
  NEW_MODE_LABEL,
} from "@/lib/portal/contract-approval";
import { CATEGORY_LABEL } from "@/components/portal/locations/locations-shared";
import { sendContractApprovalReminder } from "@/lib/portal/email";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.boservices.cz";

// Pošle schvalovatelům e-mail, že tato smlouva čeká na jejich schválení.
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
  if (contract.status !== "ke-schvaleni") {
    return NextResponse.json(
      { ok: false, error: "Smlouva není ve stavu Ke schválení." },
      { status: 409 },
    );
  }

  const approvers = await getTemplateApprovers();
  if (approvers.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Žádný uživatel není označený jako schvalovatel šablon." },
      { status: 409 },
    );
  }

  const meta = CONTRACT_TYPE_META[contract.type];
  const contractLabel = `${meta.shortName} - ${contract.clientName}${
    contract.number ? ` (${contract.number})` : ""
  }`;
  const reasonsText = contract.approvalReasons?.length
    ? `Důvody: ${contract.approvalReasons.join("; ")}.`
    : "Nesplňuje podmínky automatického schválení.";
  const snap = contract.locationSnapshot;
  const reason = snap
    ? `Lokalita ${snap.name}${
        snap.category ? ` (${CATEGORY_LABEL[snap.category]})` : ""
      }, nájem ${LEASE_HOLDER_LABEL[snap.leaseStatus]}, nový režim ${
        snap.newMode ? NEW_MODE_LABEL[snap.newMode] : "neuvedeno"
      }. ${reasonsText}`
    : `Smlouva vyžaduje schválení schvalovatelů. ${reasonsText}`;
  const deepLink = `${SITE_URL}/portal/contracts/${contract.id}`;

  const recipients: string[] = [];
  const failed: string[] = [];
  for (const approver of approvers) {
    try {
      await sendContractApprovalReminder({
        to: approver.email,
        approverName: approver.name,
        contractLabel,
        reason,
        deepLink,
      });
      recipients.push(approver.email);
    } catch (err) {
      console.error(`[contracts/remind] e-mail failed for ${approver.email}`, err);
      failed.push(approver.email);
    }
  }

  if (recipients.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Odeslání e-mailu selhalo." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    recipients,
    ...(failed.length ? { failed } : {}),
  });
}
