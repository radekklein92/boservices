import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  getTemplateApprover,
} from "@/lib/portal/users-db";
import {
  isTemplateApproved,
  listContractTemplates,
} from "@/lib/portal/contract-templates-db";
import {
  CONTRACT_TYPE_META,
  variantShortLabel,
} from "@/lib/portal/contract-types";
import { sendTemplateApprovalReminder } from "@/lib/portal/email";

// Pošle schvalovateli e-mail se seznamem aktuálně neschválených šablon.
// Cíl: kdokoli z portálu může kliknout "Připomenout emailem" - tady to
// zaagregujeme do jednoho mailu, ne per-šablona, aby admin nebombardoval
// inbox. Cron endpoint volá stejnou logiku (každý den ve 20:00 Prague).

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.boservices.cz";

export async function POST() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  return sendReminderResponse();
}

export async function sendReminderResponse(): Promise<NextResponse> {
  const approver = await getTemplateApprover();
  if (!approver) {
    return NextResponse.json(
      {
        ok: false,
        error: "Žádný uživatel není označený jako schvalovatel šablon.",
      },
      { status: 409 },
    );
  }

  const entries = await listContractTemplates();
  const pending: Array<{ label: string; deepLink: string }> = [];
  for (const e of entries) {
    if (e.variants && e.variants.length > 0) {
      for (const v of e.variants) {
        if (!isTemplateApproved(v.template)) {
          const variantLabel = variantShortLabel(e.type, v.variant);
          pending.push({
            label: `${e.meta.fullName} (var. ${variantLabel})`,
            deepLink: `${SITE_URL}/portal/templates/${e.type}?variant=${v.variant}`,
          });
        }
      }
    } else {
      if (!isTemplateApproved(e.template)) {
        pending.push({
          label: e.meta.fullName,
          deepLink: `${SITE_URL}/portal/templates/${e.type}`,
        });
      }
    }
  }

  if (pending.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: false,
      message: "Všechny šablony jsou aktuálně schválené, e-mail se neposílá.",
    });
  }

  try {
    await sendTemplateApprovalReminder({
      to: approver.email,
      approverName: approver.name,
      pendingTemplates: pending,
    });
  } catch (err) {
    console.error("[templates/remind] e-mail failed", err);
    return NextResponse.json(
      { ok: false, error: "Odeslání e-mailu selhalo." },
      { status: 500 },
    );
  }

  // Pomocný hint pro UI - kolik šablon a komu jsme upomínku poslali.
  return NextResponse.json({
    ok: true,
    sent: true,
    pendingCount: pending.length,
    to: approver.email,
  });
}

// Tip pro CONTRACT_TYPE_META cyklický import - tady jen typeguard.
void CONTRACT_TYPE_META;
