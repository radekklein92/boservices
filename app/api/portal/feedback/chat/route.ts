import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { getRedis } from "@/lib/redis";
import { feedbackTurn } from "@/lib/portal/feedback-ai";
import { FEEDBACK_LIMITS, type ChatMessage, type PageContext } from "@/lib/portal/feedback-shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const pageSchema = z.object({
  path: z.string().max(512),
  title: z.string().max(300).default(""),
  routeLabel: z.string().max(200).default(""),
  headings: z.array(z.string().max(300)).max(60).default([]),
  fieldLabels: z.array(z.string().max(200)).max(120).default([]),
  visibleText: z.string().max(8000).default(""),
  selection: z.string().max(2000).optional(),
  picked: z
    .object({
      text: z.string().max(1000),
      selector: z.string().max(400),
      role: z.string().max(120).optional(),
    })
    .optional(),
});

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(FEEDBACK_LIMITS.messageChars),
      }),
    )
    .min(1)
    .max(40),
  page: pageSchema,
});

// Lehký per-user rate limit (úniky nákladů AI). ~60 zpráv/h, no-op bez Redisu.
async function rateLimited(email: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  const key = `portal:feedback:rl:${email.toLowerCase()}`;
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, 3600);
  return n > 60;
}

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const email = g.session.user?.email ?? "";
  const name = g.session.user?.name ?? email;

  if (await rateLimited(email)) {
    return NextResponse.json(
      { ok: false, error: "Příliš mnoho zpráv za krátkou dobu. Zkuste to prosím za chvíli." },
      { status: 429 },
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
    return NextResponse.json({ ok: false, error: "Neplatný požadavek." }, { status: 400 });
  }

  const result = await feedbackTurn({
    messages: parsed.data.messages as ChatMessage[],
    page: parsed.data.page as PageContext,
    userName: name,
  });
  return NextResponse.json({ ok: true, ...result });
}
