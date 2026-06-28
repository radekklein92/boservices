import { getRedis } from "@/lib/redis";

// Redis vrstva pro Konzoli změn (/portal/admin/changes):
//  - kill switch (master on/off, spravuje superadmin) - DEFAULT vypnuto
//  - allowlist editorů (kdo smí odeslat požadavek) - spravuje superadmin
//  - log požadavků (kdo/kdy/co -> issue) pro audit a zobrazení stavu
// Bez Redisu je vše no-op (enabled=false, prázdné seznamy).

const ENABLED_KEY = "portal:devtools:enabled";
const EDITORS_KEY = "portal:devtools:editors";
const REQ_INDEX = "portal:devtools:reqs"; // zset: score=createdAtMs, member=issueNumber
const reqKey = (n: number) => `portal:devtools:req:${n}`;
const notifiedKey = (sha: string) => `portal:devtools:notified:${sha}`;

export interface ChangeRequest {
  issueNumber: number;
  issueUrl: string;
  title: string;
  request: string;
  requestedByEmail: string;
  requestedByName: string;
  createdAt: string;
}

export async function isDevtoolsEnabled(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  return (await r.get<boolean>(ENABLED_KEY)) === true;
}

export async function setDevtoolsEnabled(enabled: boolean): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await r.set(ENABLED_KEY, enabled);
}

export async function listEditors(): Promise<string[]> {
  const r = getRedis();
  if (!r) return [];
  const emails = await r.smembers(EDITORS_KEY);
  return emails.map((e) => e.toLowerCase()).sort();
}

// Full-replace allowlistu (editor drží celý stav, vzor telegram-groups).
export async function setEditors(emails: string[]): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const norm = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  await r.del(EDITORS_KEY);
  if (norm.length) await r.sadd(EDITORS_KEY, norm[0], ...norm.slice(1));
}

export async function isEditor(email: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  return (await r.sismember(EDITORS_KEY, email.toLowerCase())) === 1;
}

export async function logRequest(req: ChangeRequest): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await Promise.all([
    r.set(reqKey(req.issueNumber), req),
    r.zadd(REQ_INDEX, { score: Date.parse(req.createdAt) || 0, member: String(req.issueNumber) }),
  ]);
}

export async function getRequest(issueNumber: number): Promise<ChangeRequest | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<ChangeRequest>(reqKey(issueNumber));
}

export async function listRequests(limit = 20): Promise<ChangeRequest[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = await r.zrange<string[]>(REQ_INDEX, 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<ChangeRequest>(reqKey(Number(id))));
  const results = (await pipe.exec()) as (ChangeRequest | null)[];
  return results.filter((x): x is ChangeRequest => x !== null);
}

// Dedup notifikací o nasazení: deployment_status (success) může přijít víckrát
// pro tentýž SHA. Vrací true při PRVNÍM volání pro daný SHA (pak hodinu false).
export async function markNotifiedOnce(sha: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return true; // bez Redisu neblokujeme (radši poslat než zahodit)
  const res = await r.set(notifiedKey(sha), 1, { nx: true, ex: 3600 });
  return res === "OK";
}
