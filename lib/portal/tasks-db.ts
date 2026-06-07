import { getRedis } from "@/lib/redis";
import { getClient } from "./clients-db";
import { getLocation } from "./locations-db";
import { getContract } from "./contracts-db";
import type { SeenMap, Task, TaskLinkLabels, TaskLinks } from "./tasks-shared";
import { normalizeTask } from "./tasks-shared";

// Úložiště úkolů v Redisu. Konvence prefixů jako u smluv/klientů (portal:*).
//
//   portal:task:{id}                  → Task (JSON)
//   portal:tasks:index                → ZSET (member=id, score=createdAt ms)
//   portal:tasks:order                → string[] (manuální drag pořadí)
//   portal:tasks:by-client:{id}       → SET  ┐ reverzní indexy pro sekce
//   portal:tasks:by-location:{id}     → SET  ┤ „Úkoly" na detailech entit
//   portal:tasks:by-contract:{id}     → SET  ┘
//   portal:tasks:seen:{email}         → HASH { taskId: ISO }, TTL 30 dní

const INDEX = "portal:tasks:index";
const ORDER = "portal:tasks:order";
const taskKey = (id: string) => `portal:task:${id}`;
const byClientKey = (id: string) => `portal:tasks:by-client:${id}`;
const byLocationKey = (id: string) => `portal:tasks:by-location:${id}`;
const byContractKey = (id: string) => `portal:tasks:by-contract:${id}`;
const seenKey = (email: string) => `portal:tasks:seen:${email}`;
const SEEN_TTL = 60 * 60 * 24 * 30; // 30 dní

// Vrátí všechny úkoly v pořadí podle ORDER; úkoly, které v ORDER nejsou
// (čerstvě vytvořené), se zařadí navrch.
export async function getAllTasks(): Promise<Task[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.zrange<string[]>(INDEX, 0, -1)) ?? [];
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<Task>(taskKey(id)));
  const raw = (await pipe.exec()) as (Task | null)[];
  const tasks = raw
    .filter((t): t is Task => t !== null)
    .map(normalizeTask);

  const order = (await r.get<string[]>(ORDER)) ?? null;
  if (!order || !order.length) return tasks;
  const map = new Map(tasks.map((t) => [t.id, t]));
  const ordered = order.map((id) => map.get(id)).filter((t): t is Task => !!t);
  const orderedSet = new Set(order);
  const rest = tasks.filter((t) => !orderedSet.has(t.id));
  return [...rest, ...ordered]; // neseřazené (nové) navrch
}

export async function getTask(id: string): Promise<Task | null> {
  const r = getRedis();
  if (!r) return null;
  const raw = await r.get<Task>(taskKey(id));
  return raw ? normalizeTask(raw) : null;
}

// Uloží/aktualizuje úkol a udrží reverzní indexy vazeb v souladu (odebere staré
// členství, přidá nové). `previous` se použije pro diff vazeb (u update).
export async function upsertTask(task: Task, previous?: Task | null): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const prev = previous !== undefined ? previous : await getTask(task.id);

  const ops: Promise<unknown>[] = [
    r.set(taskKey(task.id), task),
    r.zadd(INDEX, { score: new Date(task.createdAt).getTime(), member: task.id }),
  ];

  const syncLinks = (
    keyFn: (id: string) => string,
    oldIds: string[],
    newIds: string[],
  ) => {
    const next = new Set(newIds);
    for (const id of oldIds) {
      if (!next.has(id)) ops.push(r.srem(keyFn(id), task.id));
    }
    for (const id of next) ops.push(r.sadd(keyFn(id), task.id));
  };

  syncLinks(byClientKey, prev?.links.clientIds ?? [], task.links.clientIds);
  syncLinks(byLocationKey, prev?.links.locationIds ?? [], task.links.locationIds);
  syncLinks(byContractKey, prev?.links.contractIds ?? [], task.links.contractIds);

  await Promise.all(ops);
}

export async function deleteTask(id: string): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const task = await getTask(id);
  const ops: Promise<unknown>[] = [r.del(taskKey(id)), r.zrem(INDEX, id)];
  if (task) {
    task.links.clientIds.forEach((cid) => ops.push(r.srem(byClientKey(cid), id)));
    task.links.locationIds.forEach((lid) => ops.push(r.srem(byLocationKey(lid), id)));
    task.links.contractIds.forEach((coid) => ops.push(r.srem(byContractKey(coid), id)));
  }
  await Promise.all(ops);

  // Odeber i z manuálního pořadí, ať tam nezůstává mrtvé id.
  const order = (await r.get<string[]>(ORDER)) ?? null;
  if (order && order.includes(id)) {
    await r.set(ORDER, order.filter((x) => x !== id));
  }
}

export async function setTaskOrder(ids: string[]): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await r.set(ORDER, ids);
}

async function listTasksBySet(setKey: string): Promise<Task[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.smembers(setKey)) ?? [];
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<Task>(taskKey(id)));
  const raw = (await pipe.exec()) as (Task | null)[];
  return raw
    .filter((t): t is Task => t !== null)
    .map(normalizeTask)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const listTasksByClient = (clientId: string) =>
  listTasksBySet(byClientKey(clientId));
export const listTasksByLocation = (locationId: string) =>
  listTasksBySet(byLocationKey(locationId));
export const listTasksByContract = (contractId: string) =>
  listTasksBySet(byContractKey(contractId));

// Dopočítá denormalizované popisky navázaných entit pro zobrazení v UI.
// Volá se při uložení úkolu (vazby se mění zřídka, název smí být lehce „starý").
export async function resolveLinkLabels(
  links: TaskLinks,
): Promise<TaskLinkLabels> {
  const [clients, locations, contracts] = await Promise.all([
    Promise.all(
      links.clientIds.map(async (id) => ({
        id,
        label: (await getClient(id))?.companyName ?? "klient",
      })),
    ),
    Promise.all(
      links.locationIds.map(async (id) => ({
        id,
        label: (await getLocation(id))?.name ?? "lokalita",
      })),
    ),
    Promise.all(
      links.contractIds.map(async (id) => ({
        id,
        label: (await getContract(id))?.number ?? "smlouva",
      })),
    ),
  ]);
  return { clients, locations, contracts };
}

// ──────────────────────── Seen tracking ─────────────────────────

export async function getSeenMap(email: string): Promise<SeenMap> {
  const r = getRedis();
  if (!r) return {};
  const map = await r.hgetall<SeenMap>(seenKey(email));
  return map ?? {};
}

export async function markTaskSeen(email: string, taskId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const key = seenKey(email);
  await r.hset(key, { [taskId]: new Date().toISOString() });
  await r.expire(key, SEEN_TTL);
}

export async function markAllTasksSeen(
  email: string,
  taskIds: string[],
): Promise<void> {
  const r = getRedis();
  if (!r || !taskIds.length) return;
  const key = seenKey(email);
  const now = new Date().toISOString();
  await r.hset(key, Object.fromEntries(taskIds.map((id) => [id, now])));
  await r.expire(key, SEEN_TTL);
}
