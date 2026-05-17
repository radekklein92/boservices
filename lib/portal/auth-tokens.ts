import { nanoid } from "nanoid";
import { getRedis } from "@/lib/redis";

export type TokenKind = "set-password" | "forgot";

const TTL_SECONDS: Record<TokenKind, number> = {
  "set-password": 60 * 60 * 24 * 7,
  "forgot": 60 * 60,
};

const tokenKey = (kind: TokenKind, token: string) => `portal:auth:${kind}:${token}`;

export async function createAuthToken(kind: TokenKind, email: string): Promise<string> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const token = nanoid(48);
  await r.set(tokenKey(kind, token), email.toLowerCase(), { ex: TTL_SECONDS[kind] });
  return token;
}

export async function peekAuthToken(kind: TokenKind, token: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<string>(tokenKey(kind, token));
}

export async function consumeAuthToken(kind: TokenKind, token: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  const email = await r.get<string>(tokenKey(kind, token));
  if (!email) return null;
  await r.del(tokenKey(kind, token));
  return email;
}
