import { getRedis } from "@/lib/redis";

export type UserRole = "superadmin" | "admin" | "user";

// Sekundární atribut "Podepisující". Ortogonální k role - může ho mít kdokoli.
// Když je isSigner=true, signerFunction určuje text v PDF u podpisu poskytovatele
// (jednatel = "jednatel", power-of-attorney = "na základě plné moci").
// signerDisplayName je volitelný override jména v PDF (např. "Ing. Jiří Slavkovský"
// místo jen "Jiří Slavkovský" v users listu).
export type SignerFunction = "jednatel" | "power-of-attorney";

export interface User {
  email: string;
  name: string;
  role: UserRole;
  passwordHash?: string;
  createdAt: string;
  lastLoginAt?: string;
  lastActiveAt?: string;
  isSigner?: boolean;
  signerFunction?: SignerFunction;
  signerDisplayName?: string;
}

export function signerRoleText(fn: SignerFunction): string {
  return fn === "jednatel" ? "jednatel" : "na základě plné moci";
}

export function signerFunctionLabel(fn: SignerFunction): string {
  return fn === "jednatel" ? "Jednatel" : "Na základě plné moci";
}

const ACTIVITY_THROTTLE_MS = 60_000;

const userKey = (email: string) => `portal:user:${email.toLowerCase()}`;

export async function getUser(email: string): Promise<User | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<User>(userKey(email));
}

export async function upsertUser(user: User): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const normalized: User = { ...user, email: user.email.toLowerCase() };
  await Promise.all([
    r.set(userKey(normalized.email), normalized),
    r.sadd("portal:users:all", normalized.email),
  ]);
}

export async function setPasswordHash(email: string, passwordHash: string): Promise<void> {
  const u = await getUser(email);
  if (!u) throw new Error("User not found");
  await upsertUser({ ...u, passwordHash });
}

export async function recordLogin(email: string): Promise<void> {
  const u = await getUser(email);
  if (!u) return;
  const now = new Date().toISOString();
  await upsertUser({ ...u, lastLoginAt: now, lastActiveAt: now });
}

export async function recordActivity(email: string): Promise<void> {
  const u = await getUser(email);
  if (!u) return;
  if (u.lastActiveAt) {
    const last = Date.parse(u.lastActiveAt);
    if (Number.isFinite(last) && Date.now() - last < ACTIVITY_THROTTLE_MS) {
      return;
    }
  }
  await upsertUser({ ...u, lastActiveAt: new Date().toISOString() });
}

export async function listUsers(): Promise<User[]> {
  const r = getRedis();
  if (!r) return [];
  const emails = await r.smembers("portal:users:all");
  if (!emails.length) return [];
  const pipe = r.pipeline();
  emails.forEach((e) => pipe.get<User>(userKey(e)));
  const results = (await pipe.exec()) as (User | null)[];
  return results
    .filter((u): u is User => u !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deleteUser(email: string): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const e = email.toLowerCase();
  await Promise.all([r.del(userKey(e)), r.srem("portal:users:all", e)]);
}
