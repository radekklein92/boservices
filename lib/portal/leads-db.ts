import { getRedis } from "@/lib/redis";

export async function countLeads(): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  try {
    return (await r.llen("leads:index")) ?? 0;
  } catch {
    return 0;
  }
}
