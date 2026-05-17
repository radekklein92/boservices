import { Redis } from "@upstash/redis";

let cached: Redis | null = null;

export function getRedis(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

export type Lead = {
  id: string;
  name: string;
  email: string;
  company?: string;
  message: string;
  locale: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
};
