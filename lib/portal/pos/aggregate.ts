// Čisté (bez I/O), CLIENT-SAFE agregační helpery nad per-pokladna řádky tržeb.
// Žádný "server-only" ani fetch - jen typové importy -> testovatelné v node:test
// (queries.ts je server-only a v unit testu se naimportovat nedá).

import type { ShopRevenueRow, SummaryRow } from "./types";

// Sečte by-shop řádky vybraných pokladen do jednoho SummaryRow. Řádky musí být
// už přepočtené do cílové měny (currency = `currency`).
export function rollupSummary(rows: ShopRevenueRow[], shopIds: Set<string>, currency: string): SummaryRow {
  let gross = 0;
  let net = 0;
  let vat = 0;
  let receipts = 0;
  let refunds = 0;
  let hasRefunds = false;
  for (const r of rows) {
    if (!shopIds.has(r.shop_id)) continue;
    gross += r.gross;
    net += r.net;
    vat += r.vat;
    receipts += r.receipts;
    if (typeof r.refunds === "number") {
      refunds += r.refunds;
      hasRefunds = true;
    }
  }
  return {
    currency,
    gross,
    net,
    vat,
    receipts,
    avg_ticket: receipts > 0 ? gross / receipts : null,
    // gross je už NETTO po refundacích (API kontrakt od 28.6.2026), refunds jsou
    // záporné -> míra = refunds / gross (shodné s /revenue/summary refund_rate).
    refund_rate: hasRefunds && gross > 0 ? refunds / gross : null,
  };
}

// Like-for-like pár pro deltu KPI: rollup jen za prodejny s daty v OBOU obdobích.
// "Aktivní v období" = prodejna se v daném období objeví (≥1 řádek) - shodné se
// semantikou leaderboardu (prevGross != null). Průnik je na úrovni PRODEJNY: pokud má
// prodejna v obou obdobích data, sečtou se VŠECHNY její pokladny ve scope. curC/prevC jsou
// už přepočtené do `currency`; scopeShopIds = pokladny ve výběru (u "vše" = všechny).
// `keyOf` mapuje pokladnu na klíč prodejny (locationId, nebo pseudo "shop:{id}").
// null/null = žádný srovnatelný průnik prodejen (delta se pak nevykreslí).
export function computeLfl(
  curC: ShopRevenueRow[],
  prevC: ShopRevenueRow[],
  scopeShopIds: Set<string>,
  keyOf: (shopId: string) => string,
  currency: string,
): { lflCurrent: SummaryRow | null; lflComparison: SummaryRow | null } {
  const presentKeys = (rows: ShopRevenueRow[]): Set<string> => {
    const keys = new Set<string>();
    for (const r of rows) {
      if (!scopeShopIds.has(r.shop_id)) continue;
      keys.add(keyOf(r.shop_id));
    }
    return keys;
  };
  const curKeys = presentKeys(curC);
  const prevKeys = presentKeys(prevC);
  const lflKeys = new Set([...curKeys].filter((k) => prevKeys.has(k)));
  if (lflKeys.size === 0) return { lflCurrent: null, lflComparison: null };
  const lflShopIds = new Set([...scopeShopIds].filter((id) => lflKeys.has(keyOf(id))));
  return {
    lflCurrent: rollupSummary(curC, lflShopIds, currency),
    lflComparison: rollupSummary(prevC, lflShopIds, currency),
  };
}
