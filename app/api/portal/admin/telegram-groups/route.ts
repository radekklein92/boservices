import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { isTelegramConfigured } from "@/lib/telegram";
import {
  getReAgentGroups,
  listSeenChats,
  setReAgentGroups,
  type ReAgentGroups,
} from "@/lib/portal/telegram-groups-db";

// Mapování RE agent → chat_id Telegram skupiny. Čtení i zápis jen admin.
// Full-replace (editor drží celý stav a ukládá najednou, vzor claims-overlay).

const chatId = z.string().trim().max(64);
const schema = z.object({
  groups: z.object({
    Krampera: chatId.optional(),
    Siarik: chatId.optional(),
    Kholova: chatId.optional(),
    Gransky: chatId.optional(),
    Neuzil: chatId.optional(),
  }),
});

export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.response;
  const [groups, seenChats] = await Promise.all([
    getReAgentGroups(),
    listSeenChats(),
  ]);
  return NextResponse.json({
    ok: true,
    groups,
    seenChats,
    botConfigured: isTelegramConfigured(),
  });
}

export async function PUT(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed" },
      { status: 400 },
    );
  }

  // Prázdné stringy = odmapováno (klíč vynecháme).
  const clean: ReAgentGroups = {};
  for (const [agent, value] of Object.entries(parsed.data.groups)) {
    if (value && value.trim()) clean[agent as keyof ReAgentGroups] = value.trim();
  }
  await setReAgentGroups(clean);
  return NextResponse.json({ ok: true, groups: clean });
}
