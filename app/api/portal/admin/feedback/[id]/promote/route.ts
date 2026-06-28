import { NextResponse } from "next/server";
import { requireChangeEditor } from "@/lib/portal/auth-guard";
import { createChangeIssue, isGithubConfigured } from "@/lib/portal/github";
import { logRequest } from "@/lib/portal/devtools-db";
import { getFeedbackDraft, resolveFeedbackDraft } from "@/lib/portal/feedback-db";

export const dynamic = "force-dynamic";

// POST: „Spustit implementaci" - z návrhu založí GitHub issue (@claude) přesně
// jako ruční požadavek v Konzoli změn a označí návrh jako promoted. Gated stejně
// jako odeslání požadavku (admin + allowlist + kill switch).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireChangeEditor();
  if (!g.ok) return g.response;

  if (!isGithubConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "GitHub není nakonfigurován (chybí GITHUB_BOT_TOKEN / GITHUB_OWNER / GITHUB_REPO).",
      },
      { status: 503 },
    );
  }

  const { id } = await params;
  const draft = await getFeedbackDraft(id);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "Návrh nenalezen." }, { status: 404 });
  }
  if (draft.status !== "pending") {
    return NextResponse.json({ ok: false, error: "Návrh už byl vyřízen." }, { status: 409 });
  }

  const editorEmail = g.session.user?.email ?? "";
  const editorName = g.session.user?.name ?? editorEmail;
  const requestedBy = `${draft.authorName} (návrh z portálu), spustil ${editorName}`;

  try {
    const issue = await createChangeIssue({
      title: draft.title,
      request: draft.spec,
      requestedBy,
    });
    const record = {
      issueNumber: issue.number,
      issueUrl: issue.url,
      title: draft.title,
      request: draft.spec,
      requestedByEmail: editorEmail,
      requestedByName: requestedBy,
      createdAt: new Date().toISOString(),
    };
    await logRequest(record);
    await resolveFeedbackDraft(id, {
      status: "promoted",
      promotedIssueNumber: issue.number,
      resolvedByEmail: editorEmail,
    });
    return NextResponse.json({
      ok: true,
      request: { ...record, live: { status: "working" } },
      draftId: id,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Spuštění implementace selhalo." },
      { status: 502 },
    );
  }
}
