import { getRedis } from "@/lib/redis";
import type { UserRole } from "./users-db";

export type AllowlistRole = Exclude<UserRole, "superadmin">;
export type AllowlistStatus = "pending" | "active";

export interface AllowlistEntry {
  email: string;
  name?: string;
  role: AllowlistRole;
  invitedBy: string;
  invitedAt: string;
  status: AllowlistStatus;
}

const allowKey = (email: string) => `portal:allowlist:${email.toLowerCase()}`;

export async function getAllowlistEntry(email: string): Promise<AllowlistEntry | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<AllowlistEntry>(allowKey(email));
}

export async function isAllowed(email: string): Promise<boolean> {
  return (await getAllowlistEntry(email)) !== null;
}

export async function upsertAllowlistEntry(entry: AllowlistEntry): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const normalized: AllowlistEntry = { ...entry, email: entry.email.toLowerCase() };
  await Promise.all([
    r.set(allowKey(normalized.email), normalized),
    r.sadd("portal:allowlist:all", normalized.email),
  ]);
}

export async function listAllowlist(): Promise<AllowlistEntry[]> {
  const r = getRedis();
  if (!r) return [];
  const emails = await r.smembers("portal:allowlist:all");
  if (!emails.length) return [];
  const pipe = r.pipeline();
  emails.forEach((e) => pipe.get<AllowlistEntry>(allowKey(e)));
  const results = (await pipe.exec()) as (AllowlistEntry | null)[];
  return results
    .filter((e): e is AllowlistEntry => e !== null)
    .sort((a, b) => b.invitedAt.localeCompare(a.invitedAt));
}

export async function removeAllowlistEntry(email: string): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const e = email.toLowerCase();
  await Promise.all([r.del(allowKey(e)), r.srem("portal:allowlist:all", e)]);
}

export async function markAllowlistActive(email: string): Promise<void> {
  const entry = await getAllowlistEntry(email);
  if (!entry) return;
  if (entry.status === "active") return;
  await upsertAllowlistEntry({ ...entry, status: "active" });
}
