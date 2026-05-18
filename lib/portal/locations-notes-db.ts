import { getRedis } from "@/lib/redis";

export interface LocationsBrainstorm {
  content: string;
  updatedBy: string;
  updatedAt: string;
}

const KEY = "portal:locations:brainstorm";

export async function getLocationsBrainstorm(): Promise<LocationsBrainstorm | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<LocationsBrainstorm>(KEY);
}

export async function setLocationsBrainstorm(
  note: LocationsBrainstorm,
): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await r.set(KEY, note);
}
