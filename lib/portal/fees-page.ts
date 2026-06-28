import "server-only";
// Server data vrstva stránky Poplatky (/portal/fees). Agreguje strukturované
// poplatky (Contract.feeTerms) napříč VŠEMI smlouvami a pro zvolený měsíc je
// převede na konkrétní částku se statusem:
//   - "final"    = uzavřený měsíc: fixní částka z reálné tržby bez DPH (procento
//                  × net), resp. fixní měsíční odměna.
//   - "estimate" = probíhající měsíc (run-rate) nebo budoucí měsíc (kvalifikovaný
//                  sezónní odhad z historie).
//   - "none"     = perioda mimo platnost daný měsíc nebo úplná absence dat -> jen
//                  procento/sazba bez částky.
//
// Tržby per prodejna se berou z DW (getRevenueByShop, net = bez DPH) v NATIVNÍ měně
// prodejny (žádný FX přepočet) a páruje se přes shopsByLocation.

import type { Contract } from "./contracts-db";
import { clientSignedAtEffective } from "./contracts-db";
import {
  CONTRACT_TYPE_META,
  getVariantMeta,
  isApprovalGated,
  type ContractType,
} from "./contract-types";
import {
  FEE_KIND_LABEL,
  displayPeriodEnd,
  formatFeePeriod,
  type FeeKind,
} from "./contract-fee-terms";
import * as posApi from "./pos/api";
import { posQuery } from "./pos/cache";
import { buildPairingIndex } from "./pos/pairing-db";
import type { ShopRevenueRow } from "./pos/types";

export type MonthFeeStatus = "final" | "estimate" | "none";

// Poplatky nás zajímají až od května 2026 - dřívější měsíce nemají smysl (žádné
// fakturované poplatky) a netáhneme pro ně ani historii tržeb.
export const FEES_MIN_MONTH = "2026-05";

// Jeden řádek tabulky = jedna poplatková perioda jedné smlouvy (bez měsíčního
// výpočtu). Serializovatelné do klienta.
export interface FeeRow {
  key: string;
  locationId: string;
  locationName: string;
  clientId: string;
  clientName: string;
  contractId: string;
  contractType: ContractType;
  contractLabel: string;
  periodId: string;
  periodLabel: string;
  kind: FeeKind;
  // Raw sazba: procento (>0) NEBO fixní částka (>0), nikdy obojí.
  percent: number;
  amount: number;
  amountPeriod: "monthly" | "yearly" | "one-time" | "none";
  currency: string; // měna z feeTerms (fallback pro fixní částky)
  rate: string; // naformátovaná sazba ("5 %" / "30 000 Kč/měs")
  from: string; // ISO "" = od účinnosti
  to: string; // ISO "" = dle franšízové smlouvy / bez konce
  pending?: string; // místo dat (čeká/chyba extrakce)
}

// Výsledek měsíčního výpočtu pro jeden řádek.
export interface FeeMonthResult {
  status: MonthFeeStatus;
  amount: number | null; // částka v měně `currency` (null = jen sazba)
  currency: string;
}

function feeContractLabel(c: Contract): string {
  const short = CONTRACT_TYPE_META[c.type].shortName;
  if (c.type === "franchise" && c.variant && getVariantMeta(c.type, c.variant)) {
    return `${short} ${c.variant === "AB" ? "A" : "B"}`;
  }
  return short;
}

// Ploché řádky poplatků napříč smlouvami. Filtr: approval-gated, nezrušená, s
// lokalitou, podepsaná klientem (nebo už má feeTerms). Konec spolupráce/provozování
// se odvozuje od konce franšízy téže lokality (jako v ClientFeeSummary).
export function buildFeeRows(contracts: Contract[]): FeeRow[] {
  const eligible = contracts.filter(
    (c) =>
      !c.cancelledAt &&
      isApprovalGated(c.type) &&
      c.locationId &&
      (c.feeTerms || clientSignedAtEffective(c)),
  );

  // Group per lokalita kvůli konci franšízy.
  const groups = new Map<string, Contract[]>();
  for (const c of eligible) {
    const arr = groups.get(c.locationId!) ?? [];
    arr.push(c);
    groups.set(c.locationId!, arr);
  }

  const rows: FeeRow[] = [];
  for (const [locationId, group] of groups) {
    const locationName = group[0]?.locationSnapshot?.name ?? "Lokalita";
    const franchiseEnd =
      group.find((c) => c.type === "franchise" && c.feeTerms?.termEndsAt)?.feeTerms
        ?.termEndsAt ?? "";
    for (const c of group) {
      const label = feeContractLabel(c);
      const ft = c.feeTerms;
      if (ft && ft.periods.length > 0) {
        for (const p of ft.periods) {
          rows.push({
            key: `${c.id}:${p.id}`,
            locationId,
            locationName,
            clientId: c.clientId,
            clientName: c.clientName,
            contractId: c.id,
            contractType: c.type,
            contractLabel: label,
            periodId: p.id,
            periodLabel: p.label || FEE_KIND_LABEL[p.kind],
            kind: p.kind,
            percent: p.percent,
            amount: p.amount,
            amountPeriod: p.amountPeriod,
            currency: ft.currency || "CZK",
            rate: formatFeePeriod(p, ft.currency),
            from: p.from,
            to: displayPeriodEnd(p, franchiseEnd),
          });
        }
      } else {
        rows.push({
          key: c.id,
          locationId,
          locationName,
          clientId: c.clientId,
          clientName: c.clientName,
          contractId: c.id,
          contractType: c.type,
          contractLabel: label,
          periodId: "",
          periodLabel: "—",
          kind: "other",
          percent: 0,
          amount: 0,
          amountPeriod: "none",
          currency: "CZK",
          rate: "—",
          from: "",
          to: "",
          pending: c.feeTermsError ? "chyba extrakce" : "zpracovává se",
        });
      }
    }
  }
  return rows;
}

// ── Měsíční tržby per lokalita (z DW) ───────────────────────────────────────────

const PAGE = 200;
const MAX_PAGES = 25;

// Stránkovaný sběr by-shop za jedno měsíční okno (bez waterfallu). Cachováno přes
// posQuery (klíč = razítko syncu DW + from/to), takže opakované měsíce jsou zdarma.
const _byShopMonth = posQuery(
  async (from: string, to: string): Promise<ShopRevenueRow[]> => {
    const first = await posApi.getRevenueByShop({ date_from: from, date_to: to, page: 0, limit: PAGE });
    const total = first.meta?.total ?? first.data.length;
    const pages = Math.min(MAX_PAGES, Math.ceil(total / PAGE));
    if (pages <= 1) return first.data;
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        posApi.getRevenueByShop({ date_from: from, date_to: to, page: i + 1, limit: PAGE }),
      ),
    );
    return [...first.data, ...rest.flatMap((r) => r.data)];
  },
  "fees-by-shop-month",
);

export interface MonthNet {
  net: number;
  currency: string;
}

// Měsíční net série per lokalita za zadané měsíce (klíče "YYYY-MM"). Net se sčítá
// přes pokladny lokality, měna se bere z první pokladny (nativní, bez FX).
export async function getMonthlyNetSeriesByLocation(
  months: string[],
): Promise<Map<string, Map<string, MonthNet>>> {
  if (months.length === 0) return new Map();
  const index = await buildPairingIndex();

  const perMonth = await Promise.all(
    months.map(async (mk) => {
      const { from, to } = monthBounds(mk);
      const rows = await _byShopMonth(from, to);
      const byShop = new Map<string, MonthNet>();
      for (const r of rows) byShop.set(r.shop_id, { net: r.net, currency: r.currency });
      return [mk, byShop] as const;
    }),
  );

  const series = new Map<string, Map<string, MonthNet>>();
  for (const [locationId, shopIds] of index.shopsByLocation) {
    const locMap = new Map<string, MonthNet>();
    for (const [mk, byShop] of perMonth) {
      let net = 0;
      let currency = "";
      let any = false;
      for (const sid of shopIds) {
        const v = byShop.get(sid);
        if (v) {
          net += v.net;
          if (!currency) currency = v.currency;
          any = true;
        }
      }
      if (any) locMap.set(mk, { net, currency });
    }
    if (locMap.size) series.set(locationId, locMap);
  }
  return series;
}

// ── Měsíční matematika (klíče "YYYY-MM") ────────────────────────────────────────

export function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addMonthKey(key: string, n: number): string {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(key: string): { from: string; to: string } {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

function daysInMonthKey(key: string): number {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Které měsíce musíme stáhnout z DW pro výpočet zvoleného měsíce:
//   - uzavřený měsíc -> jen on (reálná tržba),
//   - probíhající měsíc -> jen on (run-rate z dosavadní tržby),
//   - budoucí měsíc -> posledních 15 uzavřených (trailing-3 + jejich loňské
//     ekvivalenty) + loňský ekvivalent cíle (sezónní korekce).
export function monthsNeededFor(selectedMonth: string, today: Date): string[] {
  const cur = monthKeyOf(today);
  let months: string[];
  if (selectedMonth < cur) months = [selectedMonth];
  else if (selectedMonth === cur) months = [cur];
  else {
    const set = new Set<string>();
    for (let i = 1; i <= 15; i++) set.add(addMonthKey(cur, -i));
    set.add(addMonthKey(selectedMonth, -12));
    months = [...set];
  }
  // Nic dřív než od května 2026 (žádná relevantní data).
  return months.filter((m) => m >= FEES_MIN_MONTH);
}

// ── Odhad měsíční tržby (net) pro lokalitu ──────────────────────────────────────

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

// Net tržba lokality pro cílový měsíc + zda je finální nebo odhad. null = bez
// jakéhokoli podkladu (-> status "none", jen sazba).
export function estimateLocationNet(
  locSeries: Map<string, MonthNet> | undefined,
  target: string,
  today: Date,
): { net: number; status: "final" | "estimate"; currency: string } | null {
  if (!locSeries || locSeries.size === 0) return null;
  const cur = monthKeyOf(today);
  const anyCurrency = locSeries.values().next().value?.currency ?? "";

  // Uzavřený měsíc -> reálná tržba.
  if (target < cur) {
    const v = locSeries.get(target);
    return v ? { net: v.net, status: "final", currency: v.currency } : null;
  }

  // Probíhající měsíc -> run-rate z dosavadní tržby.
  const partial = locSeries.get(cur);
  const dayOfMonth = today.getUTCDate();
  if (target === cur) {
    if (partial && partial.net > 0 && dayOfMonth > 0) {
      const projected = (partial.net / dayOfMonth) * daysInMonthKey(cur);
      return { net: projected, status: "estimate", currency: partial.currency };
    }
    // bez dat tohoto měsíce zkus sezónní odhad níže (sdílená větev)
  }

  // Budoucí měsíc (nebo probíhající bez dat) -> kvalifikovaný sezónní odhad.
  const last3 = [addMonthKey(cur, -1), addMonthKey(cur, -2), addMonthKey(cur, -3)];
  const recent = last3.map((k) => locSeries.get(k)?.net).filter((n): n is number => n != null);
  if (recent.length > 0) {
    const recentAvg = avg(recent);
    const equivLY = last3.map((k) => locSeries.get(addMonthKey(k, -12))?.net);
    const netLYtarget = locSeries.get(addMonthKey(target, -12))?.net;
    const allEquiv = equivLY.filter((n): n is number => n != null);
    if (allEquiv.length === 3 && netLYtarget != null) {
      const avgEquivLY = avg(allEquiv);
      const projected = avgEquivLY > 0 ? recentAvg * (netLYtarget / avgEquivLY) : recentAvg;
      return { net: projected, status: "estimate", currency: anyCurrency };
    }
    return { net: recentAvg, status: "estimate", currency: anyCurrency };
  }

  // Žádný uzavřený měsíc: poslední pokus run-rate z probíhajícího měsíce.
  if (partial && partial.net > 0 && dayOfMonth > 0) {
    const projected = (partial.net / dayOfMonth) * daysInMonthKey(cur);
    return { net: projected, status: "estimate", currency: partial.currency };
  }
  return null;
}

// Je perioda aktivní v daném měsíci? (překryv [from,to] s měsícem, porovnání po
// měsíčních klíčích)
function periodActiveInMonth(row: FeeRow, target: string): boolean {
  const fromM = row.from ? row.from.slice(0, 7) : "";
  const toM = row.to ? row.to.slice(0, 7) : "";
  if (fromM && target < fromM) return false;
  if (toM && target > toM) return false;
  return true;
}

// Měsíční odměna z fixní částky dle periody (yearly -> /12, one-time -> jen ve
// výchozím měsíci).
function fixedMonthlyAmount(row: FeeRow, target: string): number | null {
  if (row.amountPeriod === "yearly") return row.amount / 12;
  if (row.amountPeriod === "one-time") {
    const fromM = row.from ? row.from.slice(0, 7) : "";
    return fromM && fromM === target ? row.amount : null;
  }
  return row.amount; // monthly (default)
}

// Status + částka poplatku pro zvolený měsíc.
export function computeFeeForMonth(
  row: FeeRow,
  locSeries: Map<string, MonthNet> | undefined,
  target: string,
  today: Date,
): FeeMonthResult {
  if (row.pending) return { status: "none", amount: null, currency: row.currency };
  if (!periodActiveInMonth(row, target)) {
    return { status: "none", amount: null, currency: row.currency };
  }
  const cur = monthKeyOf(today);

  // Fixní částka: nezávisí na tržbě; finální pro uzavřený měsíc, jinak odhad.
  if (row.amount > 0 && row.percent === 0) {
    const amt = fixedMonthlyAmount(row, target);
    if (amt == null) return { status: "none", amount: null, currency: row.currency };
    return { status: target < cur ? "final" : "estimate", amount: amt, currency: row.currency };
  }

  // Procentuální poplatek: částka = net × procento.
  if (row.percent > 0) {
    const est = estimateLocationNet(locSeries, target, today);
    if (!est) return { status: "none", amount: null, currency: row.currency };
    return {
      status: est.status,
      amount: (est.net * row.percent) / 100,
      currency: est.currency || row.currency,
    };
  }

  return { status: "none", amount: null, currency: row.currency };
}
