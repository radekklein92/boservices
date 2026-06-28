import { getRedis } from "@/lib/redis";

// Uložené POS pohledy (pojmenovaný snapshot celého filtru). Soukromé + sdílené
// týmové; jeden lze označit jako výchozí (načte se na prázdný vstup). Vzor:
// re-flags-db.ts (per-entity JSON + ZSET index). Filtr se ukládá jako serializovaný
// query string (serializePosFilter) -> aplikace = navigace na /portal/pos?<filter>.
//
//   portal:pos:view:{id}              → PosView (JSON)
//   portal:pos:views:user:{email}     → ZSET (member=id, score=createdAt ms) - vlastněné
//   portal:pos:views:shared           → ZSET (member=id) - sdílené (od kohokoliv)
//   portal:pos:default-view:{email}   → viewId (string)

export interface PosView {
  id: string;
  name: string;
  ownerEmail: string;
  shared: boolean;
  filter: string; // serializovaný query string (bez vedoucího "?")
  createdAt: string;
  updatedAt: string;
}

const MAX_VIEWS_PER_USER = 60;
const MAX_NAME = 60;

const viewKey = (id: string) => `portal:pos:view:${id}`;
const userIndex = (email: string) => `portal:pos:views:user:${email.toLowerCase()}`;
const SHARED_INDEX = "portal:pos:views:shared";
const defaultKey = (email: string) => `portal:pos:default-view:${email.toLowerCase()}`;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `view-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function getManyViews(ids: string[]): Promise<PosView[]> {
  const r = getRedis();
  if (!r || ids.length === 0) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<PosView>(viewKey(id)));
  const raw = (await pipe.exec()) as (PosView | null)[];
  return raw.filter((v): v is PosView => v !== null);
}

export async function getView(id: string): Promise<PosView | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<PosView>(viewKey(id));
}

// Pohledy vlastněné uživatelem (soukromé i jeho sdílené), nejnovější první.
export async function listUserViews(email: string): Promise<PosView[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.zrange<string[]>(userIndex(email), 0, -1, { rev: true })) ?? [];
  return getManyViews(ids);
}

// Všechny sdílené pohledy (od kohokoliv), nejnovější první.
export async function listSharedViews(): Promise<PosView[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.zrange<string[]>(SHARED_INDEX, 0, -1, { rev: true })) ?? [];
  return getManyViews(ids);
}

export interface ViewsForUser {
  own: PosView[];
  shared: PosView[]; // sdílené OSTATNÍMI (vlastní jsou už v `own`)
  defaultId: string | null;
}

// Vše pro loader filtru jedním čtením: vlastní + cizí sdílené + výchozí.
export async function getViewsForUser(email: string): Promise<ViewsForUser> {
  const [own, sharedAll, defaultId] = await Promise.all([
    listUserViews(email),
    listSharedViews(),
    getDefaultViewId(email),
  ]);
  const lower = email.toLowerCase();
  const shared = sharedAll.filter((v) => v.ownerEmail.toLowerCase() !== lower);
  return { own, shared, defaultId };
}

export async function createView(
  input: { name: string; filter: string; shared?: boolean },
  ownerEmail: string,
): Promise<PosView> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const existing = await r.zcard(userIndex(ownerEmail));
  if (existing >= MAX_VIEWS_PER_USER) throw new Error("Dosažen limit uložených pohledů");
  const now = new Date();
  const view: PosView = {
    id: newId(),
    name: input.name.trim().slice(0, MAX_NAME) || "Bez názvu",
    ownerEmail,
    shared: !!input.shared,
    filter: input.filter.replace(/^\?/, ""),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const ops: Promise<unknown>[] = [
    r.set(viewKey(view.id), view),
    r.zadd(userIndex(ownerEmail), { score: now.getTime(), member: view.id }),
  ];
  if (view.shared) ops.push(r.zadd(SHARED_INDEX, { score: now.getTime(), member: view.id }));
  await Promise.all(ops);
  return view;
}

// Merge update (název / sdílení / filtr). Práva ověřuje volající (autor|admin).
export async function updateView(
  id: string,
  patch: { name?: string; shared?: boolean; filter?: string },
): Promise<PosView | null> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const existing = await r.get<PosView>(viewKey(id));
  if (!existing) return null;
  const next: PosView = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, MAX_NAME) || existing.name } : {}),
    ...(patch.shared !== undefined ? { shared: patch.shared } : {}),
    ...(patch.filter !== undefined ? { filter: patch.filter.replace(/^\?/, "") } : {}),
    updatedAt: new Date().toISOString(),
  };
  const ops: Promise<unknown>[] = [r.set(viewKey(id), next)];
  if (patch.shared !== undefined && patch.shared !== existing.shared) {
    if (next.shared) ops.push(r.zadd(SHARED_INDEX, { score: Date.parse(existing.createdAt) || Date.now(), member: id }));
    else ops.push(r.zrem(SHARED_INDEX, id));
  }
  await Promise.all(ops);
  return next;
}

export async function deleteView(id: string): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const existing = await r.get<PosView>(viewKey(id));
  const ops: Promise<unknown>[] = [r.del(viewKey(id)), r.zrem(SHARED_INDEX, id)];
  if (existing) ops.push(r.zrem(userIndex(existing.ownerEmail), id));
  await Promise.all(ops);
}

export async function getDefaultViewId(email: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  return (await r.get<string>(defaultKey(email))) ?? null;
}

export async function setDefaultView(email: string, viewId: string | null): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  if (viewId) await r.set(defaultKey(email), viewId);
  else await r.del(defaultKey(email));
}

// Výchozí pohled uživatele (vlastní nebo sdílený). null když není / zmizel.
export async function getDefaultView(email: string): Promise<PosView | null> {
  const id = await getDefaultViewId(email);
  if (!id) return null;
  return getView(id);
}
