import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { saveFeedbackDraft } from "@/lib/portal/feedback-db";
import { listUsers } from "@/lib/portal/users-db";
import { sendFeedbackNotificationEmail } from "@/lib/portal/email";
import { FEEDBACK_LIMITS } from "@/lib/portal/feedback-shared";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(3).max(FEEDBACK_LIMITS.title),
  spec: z.string().trim().min(10).max(FEEDBACK_LIMITS.spec),
  page: z.object({
    path: z.string().max(512),
    title: z.string().max(300).default(""),
    routeLabel: z.string().max(200).default(""),
    selection: z.string().max(2000).optional(),
    picked: z
      .object({
        text: z.string().max(1000),
        selector: z.string().max(400),
        role: z.string().max(120).optional(),
      })
      .optional(),
  }),
});

// Příjemci notifikace: FEEDBACK_NOTIFY_TO (CSV) nebo fallback = superadmini.
async function notifyRecipients(): Promise<string[]> {
  const env = process.env.FEEDBACK_NOTIFY_TO;
  if (env) {
    return env
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  try {
    const users = await listUsers();
    return users.filter((u) => u.role === "superadmin").map((u) => u.email);
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const email = g.session.user?.email ?? "";
  const name = g.session.user?.name ?? email;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Zkontrolujte návrh (název min. 3 znaky, zadání min. 10 znaků)." },
      { status: 400 },
    );
  }

  const { title, spec, page } = parsed.data;
  const draft = await saveFeedbackDraft({
    title,
    spec,
    authorEmail: email,
    authorName: name,
    page: {
      path: page.path,
      title: page.title,
      routeLabel: page.routeLabel,
      selection: page.selection,
      picked: page.picked,
    },
  });

  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "Úložiště není dostupné, návrh se nepodařilo uložit." },
      { status: 503 },
    );
  }

  // Best-effort e-mail superadminům - ať neblokuje odpověď a nikdy ji neshodí.
  void (async () => {
    const to = await notifyRecipients();
    if (!to.length) return;
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.boservices.cz";
    await sendFeedbackNotificationEmail({
      to,
      draft: {
        title: draft.title,
        spec: draft.spec,
        authorName: draft.authorName,
        routeLabel: draft.page.routeLabel || draft.page.title,
        path: draft.page.path,
      },
      deepLink: `${site}/portal/admin/changes`,
    });
  })().catch((err) => console.error("[feedback] notify failed", err));

  return NextResponse.json({ ok: true, id: draft.id });
}
