import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireChangeEditor } from "@/lib/portal/auth-guard";
import {
  createChangeIssue,
  getRequestStatus,
  isGithubConfigured,
} from "@/lib/portal/github";
import {
  isDevtoolsEnabled,
  listEditors,
  listRequests,
  logRequest,
} from "@/lib/portal/devtools-db";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(3).max(120),
  request: z.string().trim().min(10).max(4000),
});

// GET: posledních N požadavků + jejich živý stav z GitHubu + konfigurace pro UI.
// Čtení vidí každý admin; samotné odeslání (POST) je gated requireChangeEditor.
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const [requests, editors, enabled] = await Promise.all([
    listRequests(20),
    listEditors(),
    isDevtoolsEnabled(),
  ]);
  const configured = isGithubConfigured();
  const email = g.session.user?.email?.toLowerCase() ?? "";
  const withStatus = await Promise.all(
    requests.map(async (r) => ({
      ...r,
      live: configured ? await getRequestStatus(r.issueNumber).catch(() => null) : null,
    })),
  );

  return NextResponse.json({
    ok: true,
    configured,
    enabled,
    canSubmit: enabled && editors.includes(email),
    requests: withStatus,
  });
}

// POST: založí GitHub issue (@claude + label claude-task) a zaloguje požadavek.
export async function POST(req: Request) {
  const g = await requireChangeEditor();
  if (!g.ok) return g.response;

  if (!isGithubConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "GitHub není nakonfigurován (chybí GITHUB_BOT_TOKEN / GITHUB_OWNER / GITHUB_REPO).",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Zkontrolujte název (3-120 znaků) a popis (min. 10 znaků)." },
      { status: 400 },
    );
  }

  const email = g.session.user?.email ?? "";
  const name = g.session.user?.name ?? email;
  try {
    const issue = await createChangeIssue({
      title: parsed.data.title,
      request: parsed.data.request,
      requestedBy: name,
    });
    const record = {
      issueNumber: issue.number,
      issueUrl: issue.url,
      title: parsed.data.title,
      request: parsed.data.request,
      requestedByEmail: email,
      requestedByName: name,
      createdAt: new Date().toISOString(),
    };
    await logRequest(record);
    return NextResponse.json({
      ok: true,
      request: { ...record, live: { status: "working" } },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Založení požadavku selhalo." },
      { status: 502 },
    );
  }
}
