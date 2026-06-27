import { getRedis } from "@/lib/redis";
import type { LocationConcept } from "@/lib/portal/locations-db";

// Párovací crosswalk POS pobočka (DW dim_shop) <-> portálová lokalita. Vzor:
// locations-db.ts (per-entity JSON + set index + merge-safe zápis).
// Lokální portálová konfigurace - žádné DW data se sem neduplikují.
//
// Vztah: 1 prodejna (lokalita) <-> N pokladen (jedna prodejna může mít 2-3
// pokladny). Každá pokladna patří nejvýš jedné prodejně. Reverzní směr
// (prodejna -> její pokladny) se odvozuje scanem z listShopPairs (párů je málo),
// takže žádný reverzní index není potřeba a nehrozí kolize typů v Redisu.
//
// Klíče:
//   portal:pos:shop-pair:{dwShopId} -> ShopPair JSON
//   portal:pos:shop-pairs:all       -> SET dwShopId (index pro fan-out)
//   portal:pos:ignored-shops        -> SET dwShopId (pokladny vyřazené z párování)
//   portal:pos:brand-concept        -> Record<brandId, LocationConcept>

export type ShopPairStatus = "active" | "unpaired" | "orphaned";

export interface ShopPair {
  dwShopId: string; // dim_shop.id (uuid)
  locationId: string | null; // portálová MirroredLocation.id; null = záměrně nepárováno
  city: string; // ZADÁNO PŘI PÁROVÁNÍ (autoritativní pro city leaderboard)
  brandId: string; // dim_shop.brand_id (snapshot pro validaci/koncept)
  dwShopName: string; // snapshot názvu pobočky (detekce přejmenování/odebrání)
  concept?: LocationConcept; // override; jinak se odvodí z mapy značka->koncept
  pairedBy: string;
  pairedAt: string;
  status: ShopPairStatus; // orphaned = pobočka zmizela z DW (mapování se nemaže)
}

export type BrandConceptMap = Record<string, LocationConcept>;

const pairKey = (dwShopId: string) => `portal:pos:shop-pair:${dwShopId}`;
const PAIRS_INDEX = "portal:pos:shop-pairs:all";
const IGNORED_KEY = "portal:pos:ignored-shops";
const BRAND_CONCEPT_KEY = "portal:pos:brand-concept";

export async function getShopPair(dwShopId: string): Promise<ShopPair | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<ShopPair>(pairKey(dwShopId));
}

export async function listShopPairs(): Promise<ShopPair[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = await r.smembers(PAIRS_INDEX);
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<ShopPair>(pairKey(id)));
  const rows = (await pipe.exec()) as (ShopPair | null)[];
  return rows.filter((p): p is ShopPair => p !== null);
}

// Všechny pokladny napárované na danou lokalitu (1 prodejna <-> N pokladen).
// Odvozeno scanem z listShopPairs - párů je málo a volá se na detailu lokality.
export async function getShopPairsByLocation(locationId: string): Promise<ShopPair[]> {
  const pairs = await listShopPairs();
  return pairs.filter((p) => p.locationId === locationId && p.status !== "orphaned");
}

// Merge-safe zápis: načte stávající, přepíše jen předaná pole. Pokladna se přiřadí
// na lokalitu; sourozenecké pokladny na téže lokalitě zůstávají (vztah je N:1).
export async function upsertShopPair(
  input: Partial<ShopPair> & { dwShopId: string },
): Promise<ShopPair> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const existing = await r.get<ShopPair>(pairKey(input.dwShopId));
  const newLoc = input.locationId !== undefined ? input.locationId : existing?.locationId ?? null;
  const merged: ShopPair = {
    dwShopId: input.dwShopId,
    locationId: newLoc,
    city: input.city !== undefined ? input.city : existing?.city ?? "",
    brandId: input.brandId ?? existing?.brandId ?? "",
    dwShopName: input.dwShopName ?? existing?.dwShopName ?? "",
    concept: input.concept !== undefined ? input.concept : existing?.concept,
    pairedBy: input.pairedBy ?? existing?.pairedBy ?? "",
    pairedAt: input.pairedAt ?? existing?.pairedAt ?? new Date().toISOString(),
    status: input.status ?? existing?.status ?? (newLoc ? "active" : "unpaired"),
  };
  await Promise.all([r.set(pairKey(merged.dwShopId), merged), r.sadd(PAIRS_INDEX, merged.dwShopId)]);
  return merged;
}

export async function removeShopPair(dwShopId: string): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await Promise.all([r.del(pairKey(dwShopId)), r.srem(PAIRS_INDEX, dwShopId)]);
}

// Ignorované pokladny: registry, které se vědomě nepárují (cizí provozovny mimo
// portál, akční/popup kasy, testovací). Drží se odděleně od párování, aby se daly
// kdykoli obnovit. Vyřazené z aktivního seznamu k napárování, NE z analytiky.
export async function listIgnoredShops(): Promise<string[]> {
  const r = getRedis();
  if (!r) return [];
  return (await r.smembers(IGNORED_KEY)) ?? [];
}

export async function setShopIgnored(dwShopId: string, ignored: boolean): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  if (ignored) await r.sadd(IGNORED_KEY, dwShopId);
  else await r.srem(IGNORED_KEY, dwShopId);
}

export async function getBrandConceptMap(): Promise<BrandConceptMap> {
  const r = getRedis();
  if (!r) return {};
  return (await r.get<BrandConceptMap>(BRAND_CONCEPT_KEY)) ?? {};
}

export async function setBrandConceptMap(map: BrandConceptMap): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await r.set(BRAND_CONCEPT_KEY, map);
}

// Pomocné indexy pro scope/řazení v dotazech a obrazovkách. Postavené z jednoho
// fan-out čtení (cachuje se přes tag posPairing tam, kde se použije).
export interface PairingIndex {
  cityByShop: Map<string, string>; // dwShopId -> město (z párování)
  locationByShop: Map<string, string>; // dwShopId -> locationId
  shopsByLocation: Map<string, string[]>; // locationId -> dwShopId[] (N pokladen na prodejně)
  conceptByShop: Map<string, LocationConcept>; // override nebo z brand-concept mapy
  pairs: ShopPair[];
}

export async function buildPairingIndex(): Promise<PairingIndex> {
  const [pairs, brandConcept] = await Promise.all([listShopPairs(), getBrandConceptMap()]);
  const cityByShop = new Map<string, string>();
  const locationByShop = new Map<string, string>();
  const shopsByLocation = new Map<string, string[]>();
  const conceptByShop = new Map<string, LocationConcept>();
  for (const p of pairs) {
    if (p.status === "orphaned") continue;
    if (p.city) cityByShop.set(p.dwShopId, p.city);
    if (p.locationId) {
      locationByShop.set(p.dwShopId, p.locationId);
      const arr = shopsByLocation.get(p.locationId) ?? [];
      arr.push(p.dwShopId);
      shopsByLocation.set(p.locationId, arr);
    }
    const concept = p.concept ?? (p.brandId ? brandConcept[p.brandId] : undefined);
    if (concept) conceptByShop.set(p.dwShopId, concept);
  }
  return { cityByShop, locationByShop, shopsByLocation, conceptByShop, pairs };
}
