import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/portal/cron-auth";
import {
  findPrForCommit,
  getCommitMessage,
  isGithubConfigured,
} from "@/lib/portal/github";
import { getRequest, markNotifiedOnce } from "@/lib/portal/devtools-db";
import { sendDeployNotificationEmail } from "@/lib/portal/email";

export const dynamic = "force-dynamic";

// Volá GitHub Actions workflow deploy-notify.yml po úspěšném PRODUKČNÍM nasazení
// (deployment_status). Auth Bearer CRON_SECRET (stejně jako crony). Default:
// e-mail jen u nasazení pocházejících z Portálu (PR odkazuje na zalogovaný
// požadavek); DEPLOY_NOTIFY_ALL=1 = e-mail u všech produkčních nasazení.
export async function POST(req: Request) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  let body: { sha?: string; url?: string; environment?: string; state?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* tolerantní k prázdnému tělu */
  }

  // Default příjemci = superadmini (PORTAL_SUPERADMIN_EMAILS) - netřeba zvlášť
  // nastavovat; DEPLOY_NOTIFY_TO je přepíše.
  const to = (process.env.DEPLOY_NOTIFY_TO || process.env.PORTAL_SUPERADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!to.length) return NextResponse.json({ ok: true, skipped: "no recipients" });

  // Dedup: deployment_status (success) může pro tentýž SHA dorazit víckrát.
  if (body.sha && !(await markNotifiedOnce(body.sha))) {
    return NextResponse.json({ ok: true, skipped: "already notified" });
  }

  let prNumber: number | undefined;
  let prUrl: string | undefined;
  let prTitle: string | undefined;
  let requestedBy: string | undefined;
  let commitMessage: string | undefined;
  let portalDriven = false;

  if (body.sha && isGithubConfigured()) {
    try {
      const pr = await findPrForCommit(body.sha);
      if (pr) {
        prNumber = pr.number;
        prUrl = pr.html_url;
        prTitle = pr.title;
        const issueNum = parseIssueRef(pr.body);
        if (issueNum) {
          const rec = await getRequest(issueNum);
          if (rec) {
            portalDriven = true;
            requestedBy = rec.requestedByName;
          }
        }
      }
      commitMessage = await getCommitMessage(body.sha).catch(() => undefined);
    } catch {
      /* best-effort obohacení e-mailu */
    }
  }

  if (!portalDriven && process.env.DEPLOY_NOTIFY_ALL !== "1") {
    return NextResponse.json({ ok: true, skipped: "not portal-driven" });
  }

  await sendDeployNotificationEmail({
    to,
    liveUrl: body.url,
    commitMessage,
    prNumber,
    prUrl,
    prTitle,
    requestedBy,
  });
  return NextResponse.json({ ok: true, sent: true, portalDriven });
}

// Vytáhne číslo navázaného issue z těla PR ("Closes #123" apod.), jinak první #N.
function parseIssueRef(prBody: string | null | undefined): number | null {
  if (!prBody) return null;
  const m =
    prBody.match(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i) ??
    prBody.match(/#(\d+)/);
  return m ? Number(m[1]) : null;
}
