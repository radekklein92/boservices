import { getRedis } from "@/lib/redis";
import { removeFlagIdFromAllLocations } from "./locations-db";
import type { ReFlag, ReFlagColor } from "./re-flags-shared";

// Katalog uživatelských flagů (barevné štítky lokalit). Sdílený napříč týmem.
// Konvence prefixů jako u úkolů/klientů (portal:*):
//
//   portal:re-flag:{id}     → ReFlag (JSON)
//   portal:re-flags:index   → ZSET (member=id, score=createdAt ms)
//
// Přiřazení flagů k lokalitě NEžije tady — drží ho LocationLocal.flagIds
// (merge-safe patchLocationLocal). Smazání flagu uklidí osiřelá id z lokalit.

const INDEX = "portal:re-flags:index";
const flagKey = (id: string) => `portal:re-flag:${id}`;

function newFlagId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `flag-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listReFlags(): Promise<ReFlag[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.zrange<string[]>(INDEX, 0, -1)) ?? [];
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<ReFlag>(flagKey(id)));
  const raw = (await pipe.exec()) as (ReFlag | null)[];
  // ZSET drží pořadí dle createdAt (nejstarší první) — stabilní pořadí v UI.
  return raw.filter((f): f is ReFlag => f !== null);
}

export async function getReFlag(id: string): Promise<ReFlag | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<ReFlag>(flagKey(id));
}

export async function createReFlag(
  input: { label: string; color: ReFlagColor },
  createdBy: string,
): Promise<ReFlag> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const now = new Date();
  const flag: ReFlag = {
    id: newFlagId(),
    label: input.label.trim(),
    color: input.color,
    createdBy,
    createdAt: now.toISOString(),
  };
  await Promise.all([
    r.set(flagKey(flag.id), flag),
    r.zadd(INDEX, { score: now.getTime(), member: flag.id }),
  ]);
  return flag;
}

// Merge update (label a/nebo barva). Vrací null, pokud flag neexistuje.
// createdBy/createdAt se nemění (autorství zůstává).
export async function updateReFlag(
  id: string,
  patch: { label?: string; color?: ReFlagColor },
): Promise<ReFlag | null> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const existing = await r.get<ReFlag>(flagKey(id));
  if (!existing) return null;
  const next: ReFlag = {
    ...existing,
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
  };
  await r.set(flagKey(id), next);
  return next;
}

// Smaže flag z katalogu a odebere ho ze všech lokalit (orphan cleanup).
// Vrací počet dotčených lokalit (kvůli rozhodnutí, jestli bustovat lokality).
export async function deleteReFlag(id: string, updatedBy: string): Promise<number> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await Promise.all([r.del(flagKey(id)), r.zrem(INDEX, id)]);
  return removeFlagIdFromAllLocations(id, updatedBy);
}
