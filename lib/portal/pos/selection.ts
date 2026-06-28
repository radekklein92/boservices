// Resolver výběru prodejen -> množina pokladen (dwShopId). CLIENT-SAFE (čistá
// funkce, jen typové importy) - lze testovat bez Redisu i volat z RSC.
//
// DW API umí filtrovat jen jedním brand_id/shop_id, ne množinou. Multi-select
// (koncepty + lokality) proto rozkládáme tady na konkrétní pokladny a agregaci
// (rollup) děláme portálově nad /revenue/by-shop. Viz queries.ts.

import type { LocationConcept } from "@/lib/portal/locations-db";
import type { ApiShop } from "./types";
import type { PairingIndex } from "./pairing-db";
import { isAllSelection, type PosSelection } from "./filters";

export interface ResolvedSelection {
  shopIds: Set<string>; // dwShopId zahrnuté do výběru
  isAll: boolean; // true = celá síť (prázdný výběr)
  // brandId, jejichž VŠECHNY (nevyřazené) pokladny jsou ve výběru. getDailyTrend
  // díky tomu pozná, kdy stačí levný brand-grain místo per-pokladna fan-outu.
  coversWholeBrands: string[];
}

// Koncept pokladny: PRIMÁRNĚ z její lokality (zdroj pravdy), jinak fallback
// (override / brand-concept mapa), jinak "other". Nikdy undefined.
export function conceptOfShop(shopId: string, index: PairingIndex): LocationConcept {
  const locationId = index.locationByShop.get(shopId);
  if (locationId) {
    const c = index.conceptByLocation.get(locationId);
    if (c) return c;
  }
  return index.conceptByShop.get(shopId) ?? "other";
}

function computeCoveredBrands(shops: ApiShop[], selected: Set<string>): string[] {
  const stat = new Map<string, { total: number; covered: number }>();
  for (const s of shops) {
    const e = stat.get(s.brand_id) ?? { total: 0, covered: 0 };
    e.total += 1;
    if (selected.has(s.id)) e.covered += 1;
    stat.set(s.brand_id, e);
  }
  const out: string[] = [];
  for (const [brandId, e] of stat) {
    if (e.total > 0 && e.covered === e.total) out.push(brandId);
  }
  return out;
}

// `shops` = getAllShops() (bez test/AED). Pro "vše" i pro expanzi brand:/city:
// tokenů potřebujeme úplný seznam pokladen s brand_id.
export function resolveSelection(
  selection: PosSelection,
  index: PairingIndex,
  shops: ApiShop[],
): ResolvedSelection {
  if (isAllSelection(selection)) {
    const shopIds = new Set(shops.map((s) => s.id));
    return { shopIds, isAll: true, coversWholeBrands: computeCoveredBrands(shops, shopIds) };
  }

  const set = new Set<string>();

  // Koncepty -> všechny pokladny daného konceptu.
  if (selection.concepts.length > 0) {
    const wanted = new Set<string>(selection.concepts);
    for (const s of shops) {
      if (wanted.has(conceptOfShop(s.id, index))) set.add(s.id);
    }
  }

  // Lokalitní tokeny.
  if (selection.locations.length > 0) {
    const known = new Set(shops.map((s) => s.id));
    for (const tok of selection.locations) {
      if (tok.startsWith("shop:")) {
        const id = tok.slice(5);
        if (known.has(id)) set.add(id);
      } else if (tok.startsWith("brand:")) {
        const brandId = tok.slice(6);
        for (const s of shops) if (s.brand_id === brandId) set.add(s.id);
      } else if (tok.startsWith("city:")) {
        const city = tok.slice(5);
        for (const s of shops) if (index.cityByShop.get(s.id) === city) set.add(s.id);
      } else {
        // bare locationId -> jeho pokladny (N:1)
        const ids = index.shopsByLocation.get(tok);
        if (ids) for (const id of ids) if (known.has(id)) set.add(id);
      }
    }
  }

  return { shopIds: set, isAll: false, coversWholeBrands: computeCoveredBrands(shops, set) };
}
