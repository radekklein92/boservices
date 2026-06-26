import { getRedis } from "@/lib/redis";
import type { ReAgent } from "./locations-db";

// Mapování RE agent → chat_id dedikované Telegram skupiny + evidence „viděných"
// chatů (kam byl bot přidán / kde padla zpráva) pro snadné nastavení v adminu.
// Vše jako JSON pod jedním klíčem (vzor portal:locations:newco-mapping).

const GROUPS_KEY = "portal:telegram:re-agent-groups";
const SEEN_KEY = "portal:telegram:seen-chats";

// Zdroj pravdy pro výčet agentů (shodný s typem ReAgent v locations-db).
export const RE_AGENTS: readonly ReAgent[] = [
  "Krampera",
  "Siarik",
  "Kholova",
  "Gransky",
  "Neuzil",
] as const;

export type ReAgentGroups = Partial<Record<ReAgent, string>>;

export async function getReAgentGroups(): Promise<ReAgentGroups> {
  const r = getRedis();
  if (!r) return {};
  return (await r.get<ReAgentGroups>(GROUPS_KEY)) ?? {};
}

export async function setReAgentGroups(groups: ReAgentGroups): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await r.set(GROUPS_KEY, groups);
}

// Reverse lookup pro webhook: která skupina (chat_id) patří kterému agentovi.
// Skupina je dedikovaná jednomu agentovi, takže chat_id agenta jednoznačně určí.
export async function agentByChatId(chatId: string): Promise<ReAgent | null> {
  const groups = await getReAgentGroups();
  for (const agent of RE_AGENTS) {
    if (groups[agent] === chatId) return agent;
  }
  return null;
}

// Telegram chaty, které bot „viděl" (přidání do skupiny / zpráva) — podklad pro
// admin UI, ať jde chat_id vybrat místo opisovat. Klíčováno chat_id (dedup).
export interface SeenChat {
  chatId: string;
  title: string;
  at: string;
}

export async function recordSeenChat(
  chatId: string,
  title: string,
  at: string,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const seen = (await r.get<Record<string, SeenChat>>(SEEN_KEY)) ?? {};
  seen[chatId] = { chatId, title, at };
  await r.set(SEEN_KEY, seen);
}

export async function listSeenChats(): Promise<SeenChat[]> {
  const r = getRedis();
  if (!r) return [];
  const seen = (await r.get<Record<string, SeenChat>>(SEEN_KEY)) ?? {};
  return Object.values(seen).sort((a, b) => b.at.localeCompare(a.at));
}
