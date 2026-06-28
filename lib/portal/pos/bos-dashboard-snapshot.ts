import "server-only";
import { getRedis } from "@/lib/redis";
import { getBosDashboardRevenue, type BosDashboardRevenue } from "./queries";

// Snapshot BOS dashboard tržeb v Redis. Drahý výpočet (getBosDashboardRevenue,
// 5 DW dotazů) běží JEN v cronu (pos-cache-warm) a uloží výsledek sem. Dashboard
// pak čte jen tento snapshot (1 Redis GET) - nikdy nepočítá, takže se nezdrží.
const KEY = "portal:bos-dashboard-revenue";
// Pojistka: kdyby cron dlouho neběžel (>24 h), raději placeholder než velmi stará
// čísla. Za normálu se klíč obnovuje každých 5 min, takže nikdy nevyprší.
const TTL_SECONDS = 24 * 3600;

// Spočítá aktuální data a uloží snapshot (volá cron). Vrací i data (kvůli warmu).
export async function refreshBosDashboardSnapshot(): Promise<BosDashboardRevenue> {
  const data = await getBosDashboardRevenue();
  const r = getRedis();
  if (r) await r.set(KEY, data, { ex: TTL_SECONDS });
  return data;
}

// Rychlé čtení snapshotu pro dashboard. null = ještě není (cron doplní do ~5 min)
// nebo Redis není nakonfigurovaný.
export async function getBosDashboardSnapshot(): Promise<BosDashboardRevenue | null> {
  const r = getRedis();
  if (!r) return null;
  return (await r.get<BosDashboardRevenue>(KEY)) ?? null;
}
