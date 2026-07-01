import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/portal/cron-auth";
import { listContracts } from "@/lib/portal/contracts-db";
import { getTemplateApprovers } from "@/lib/portal/users-db";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
import { sendContractsApprovalDigest } from "@/lib/portal/email";

// Vercel Cron Job. vercel.json: "0 6 * * *" (denně 6:00 UTC).
// V CET (zima) = 7:00 Prague, v CEST (léto) = 8:00 Prague - protože většinu
// roku platí CEST, je tohle blíž k požadavku "v 8:00 Prague".
//
// Pokud existují smlouvy ve stavu „Ke schválení", pošle každému schvalovateli
// šablon souhrnný e-mail se seznamem. Když žádné nečekají, nic se neposílá.
//
// Autentizace stejná jako u ostatních cronů: Authorization: Bearer <CRON_SECRET>
// (na local devu bez CRON_SECRET se auth přeskočí).

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.boservices.cz";

export async function GET(req: Request) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const pending = (await listContracts()).filter(
    (c) => c.status === "ke-schvaleni",
  );
  if (pending.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: false,
      message: "Žádné smlouvy ve stavu Ke schválení.",
    });
  }

  const approvers = await getTemplateApprovers();
  if (approvers.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Žádný uživatel není označený jako schvalovatel šablon." },
      { status: 409 },
    );
  }

  const items = pending.map((c) => ({
    label: `${CONTRACT_TYPE_META[c.type].shortName} - ${c.clientName}${
      c.number ? ` (${c.number})` : ""
    }`,
    deepLink: `${SITE_URL}/portal/contracts/${c.id}`,
  }));

  const recipients: string[] = [];
  const failed: string[] = [];
  for (const approver of approvers) {
    try {
      await sendContractsApprovalDigest({
        to: approver.email,
        approverName: approver.name,
        contracts: items,
      });
      recipients.push(approver.email);
    } catch (err) {
      console.error(
        `[contracts-approval-reminder] e-mail failed for ${approver.email}`,
        err,
      );
      failed.push(approver.email);
    }
  }

  return NextResponse.json({
    ok: recipients.length > 0,
    sent: recipients.length > 0,
    pendingCount: items.length,
    recipients,
    ...(failed.length ? { failed } : {}),
  });
}
