import { nanoid } from "nanoid";
import { getRedis } from "@/lib/redis";

// Redis vrstva pro návrhy změn z feedback widgetu. Návrh (FeedbackDraft) je
// MEZIstav PŘED Konzolí změn: vytvoří ho kdokoli přihlášený přes AI chat, admin
// ho pak v Konzoli změn buď „spustí" (→ GitHub issue, viz devtools-db/github),
// nebo zamítne. Bez Redisu je save no-op (vrací null) a počty jsou 0.

export type FeedbackStatus = "pending" | "promoted" | "dismissed";

// Část kontextu stránky, kterou si u návrhu uchováváme pro admina (ne celý
// viditelný text - ten šel jen do AI; tady stačí, kde a na co uživatel ukazoval).
export interface FeedbackDraftPage {
  path: string;
  title: string;
  routeLabel: string;
  selection?: string;
  picked?: { text: string; selector: string; role?: string };
}

export interface FeedbackDraft {
  id: string;
  title: string;
  spec: string;
  status: FeedbackStatus;
  authorEmail: string;
  authorName: string;
  page: FeedbackDraftPage;
  createdAt: string;
  promotedIssueNumber?: number;
  resolvedByEmail?: string;
  resolvedAt?: string;
}

const INDEX = "portal:feedback:index"; // zset: score=createdAtMs, member=id
const PENDING = "portal:feedback:pending"; // set id (O(1) počet pro odznak)
const itemKey = (id: string) => `portal:feedback:item:${id}`;

export async function saveFeedbackDraft(input: {
  title: string;
  spec: string;
  authorEmail: string;
  authorName: string;
  page: FeedbackDraftPage;
}): Promise<FeedbackDraft | null> {
  const r = getRedis();
  if (!r) return null;
  const draft: FeedbackDraft = {
    id: nanoid(),
    title: input.title,
    spec: input.spec,
    status: "pending",
    authorEmail: input.authorEmail.toLowerCase(),
    authorName: input.authorName,
    page: input.page,
    createdAt: new Date().toISOString(),
  };
  await Promise.all([
    r.set(itemKey(draft.id), draft),
    r.zadd(INDEX, { score: Date.parse(draft.createdAt) || 0, member: draft.id }),
    r.sadd(PENDING, draft.id),
  ]);
  return draft;
}

export async function getFeedbackDraft(id: string): Promise<FeedbackDraft | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<FeedbackDraft>(itemKey(id));
}

// Posledních N návrhů (nejnovější první), volitelně filtr na stav.
export async function listFeedbackDrafts(
  status?: FeedbackStatus,
  limit = 100,
): Promise<FeedbackDraft[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = await r.zrange<string[]>(INDEX, 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<FeedbackDraft>(itemKey(id)));
  const results = (await pipe.exec()) as (FeedbackDraft | null)[];
  const all = results.filter((x): x is FeedbackDraft => x !== null);
  return status ? all.filter((d) => d.status === status) : all;
}

// Vyřízení návrhu (promote/dismiss). Idempotentně odebere z PENDING setu.
export async function resolveFeedbackDraft(
  id: string,
  patch: {
    status: Exclude<FeedbackStatus, "pending">;
    promotedIssueNumber?: number;
    resolvedByEmail?: string;
  },
): Promise<FeedbackDraft | null> {
  const r = getRedis();
  if (!r) return null;
  const draft = await r.get<FeedbackDraft>(itemKey(id));
  if (!draft) return null;
  const next: FeedbackDraft = {
    ...draft,
    status: patch.status,
    promotedIssueNumber: patch.promotedIssueNumber ?? draft.promotedIssueNumber,
    resolvedByEmail: patch.resolvedByEmail?.toLowerCase() ?? draft.resolvedByEmail,
    resolvedAt: new Date().toISOString(),
  };
  await Promise.all([r.set(itemKey(id), next), r.srem(PENDING, id)]);
  return next;
}

// Počet nevyřízených návrhů (pro odznak v menu). O(1) přes set.
export async function countPendingFeedback(): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  return (await r.scard(PENDING)) ?? 0;
}
