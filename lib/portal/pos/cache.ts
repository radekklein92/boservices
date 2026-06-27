import { unstable_cache } from "next/cache";
import { TAG } from "@/lib/portal/cache-tags";
import { getLastSync } from "./api";
import type { LastSync } from "./types";

// POS data se obnovují SYNCHRONNĚ s ingestem BOServices-DW (DW refreshuje
// materializované pohledy ~á 15 min). Obnovu ale NEřídí slepý 15min TTL - ten je
// vůči 15min cyklu DW mimo fázi (kdyby cache načetla těsně před syncem, držela by
// stará data dalších 15 min). Místo toho přimícháváme RAZÍTKO POSLEDNÍHO SYNCU DW
// do cache klíče: když DW vyrobí nová data, razítko se změní -> cache miss ->
// čerstvá data hned (do ~POS_SYNC_PROBE_TTL). Mezi syncy je razítko stabilní ->
// cache hit, žádné zbytečné dotazy na API. POS_DATA_TTL je už jen pojistka.
export const POS_DATA_TTL = 900; // 15 min - backstop; reálnou invalidaci řídí razítko syncu
export const POS_SYNC_PROBE_TTL = 60; // jak rychle zaznamenáme nový sync DW (tiny dotaz na /meta/last-sync)

// Cached /v1/meta/last-sync - sdílené serverové memo (jeden dotaz za probe okno
// napříč všemi uživateli). Používá se pro badge "Aktualizováno" i jako zdroj
// verze dat. Při výpadku probe vrací null (data si pak poradí přes POS_DATA_TTL).
export const getLastSyncCached = unstable_cache(
  async (): Promise<LastSync | null> => {
    try {
      return await getLastSync();
    } catch {
      return null;
    }
  },
  ["pos", "last-sync"],
  { revalidate: POS_SYNC_PROBE_TTL, tags: [TAG.posData] },
);

// "Verze dat" = razítko posledního úspěšného syncu DW. Vstupuje do cache klíče
// POS dotazů (viz posQuery). "live" fallback (když probe selže) drží data čerstvá
// přes POS_DATA_TTL.
export async function getDwDataVersion(): Promise<string> {
  const s = await getLastSyncCached();
  return s?.last_successful_run_at ?? "live";
}

// Obalí read funkci do Next data cache (tag posData) a do cache klíče přimíchá
// razítko syncu DW -> obnova je zarovnaná na produkci dat v DW (rychlá hned po
// syncu, žádné zbytečné dotazy mezi syncy). Vrácená funkce má STEJNOU signaturu
// jako `fn`; verze se vlákne dovnitř transparentně.
export function posQuery<A extends readonly unknown[], R>(
  fn: (...args: A) => Promise<R>,
  key: string,
  revalidate: number = POS_DATA_TTL,
): (...args: A) => Promise<R> {
  const cached = unstable_cache(
    (_version: string, ...args: A) => fn(...args),
    ["pos", key],
    { revalidate, tags: [TAG.posData] },
  );
  return (...args: A) => getDwDataVersion().then((v) => cached(v, ...args));
}
