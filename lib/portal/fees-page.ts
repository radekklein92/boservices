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
  signedMonth: string; // "YYYY-MM" data podpisu klienta (účinnost pro pending řádky)
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
    const franchiseEnd = franchiseEndForGroup(group);
    for (const c of group) {
      const label = feeContractLabel(c);
      const signedMonth = (clientSignedAtEffective(c) ?? "").slice(0, 7);
      const ft = c.feeTerms;
      if (ft && ft.periods.length > 0) {
        // Odložená fakturace (invoicingStartsFrom) posune ZAČÁTEK fakturace poplatku:
        // poplatek se za daný měsíc účtuje až od max(účinnost periody, odklad).
        // Tím OD sloupec, aktivita v měsíci i okno tržby respektují odklad
        // (např. BRYSTAN: účinnost 1.7., ale fakturace za obrat až od 1.9.).
        const inv = (ft.invoicingStartsFrom || "").slice(0, 10);
        for (const p of ft.periods) {
          const pFrom = (p.from || "").slice(0, 10);
          const billingFrom = inv && (!pFrom || inv > pFrom) ? inv : p.from;
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
            from: billingFrom,
            to: displayPeriodEnd(p, franchiseEnd),
            signedMonth,
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
          signedMonth,
          pending: c.feeTermsError ? "chyba extrakce" : "zpracovává se",
        });
      }
    }
  }
  return rows;
}

// Konec franšízy lokality (od něj se odvozuje konec spolupráce/provozování i konec
// poslední franšízové periody bez vlastního `to`). Primárně termEndsAt franšízy;
// když chybí (starší/nedotažená extrakce), default 10 let (120 měsíců) od nejdřívější
// účinnosti franšízy (shodně s PR #166) - ať vždy ukážeme konkrétní datum místo
// „dle franšízové smlouvy".
function franchiseEndForGroup(group: Contract[]): string {
  const fr = group.find((c) => c.type === "franchise" && c.feeTerms);
  if (!fr?.feeTerms) return "";
  if (fr.feeTerms.termEndsAt) return fr.feeTerms.termEndsAt;
  const froms = fr.feeTerms.periods.map((p) => p.from).filter(Boolean).sort();
  return froms[0] ? addMonthsISO(froms[0], 120) : "";
}

// Přičte n měsíců k ISO datu (YYYY-MM-DD) s clampem na konec měsíce.
function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const daysInTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const day = Math.min(d, daysInTarget);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}


// ── Měsíční matematika ──────────────────────────────────────────────────────────

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

function isoToUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map((s) => parseInt(s, 10));
  return Date.UTC(y, m - 1, d);
}

// Počet dní v intervalu [from, to] včetně obou krajů.
function dayCountInclusive(from: string, to: string): number {
  return Math.round((isoToUTC(to) - isoToUTC(from)) / 86_400_000) + 1;
}

function todayISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ── Aktivita periody v měsíci ─────────────────────────────────────────────────

// Překryv [from, to] periody s měsícem (porovnání po měsíčních klíčích).
export function periodActiveInMonth(row: FeeRow, month: string): boolean {
  const fromM = row.from ? row.from.slice(0, 7) : "";
  const toM = row.to ? row.to.slice(0, 7) : "";
  if (fromM && month < fromM) return false;
  if (toM && month > toM) return false;
  return true;
}

// Je řádek v daném měsíci „účinný"? Pending (nezpracované - „zpracovává se"/chyba)
// řádky se NEzobrazují (nemají vytažené poplatky, nelze nic spočítat).
export function isRowActiveInMonth(row: FeeRow, month: string): boolean {
  if (row.pending) return false;
  return periodActiveInMonth(row, month);
}

// Měsíce, které mají smysl zobrazit: jen ty s aspoň jednou účinnou smlouvou
// (prázdné měsíce - nikdo neměl účinnou smlouvu - vůbec nenabízíme). Od května
// 2026 do max. roku dopředu (kvalifikovaný odhad do budoucna).
export function navigableMonths(rows: FeeRow[], today: Date): string[] {
  const ceiling = addMonthKey(monthKeyOf(today), 12);
  const months: string[] = [];
  let m = FEES_MIN_MONTH;
  while (m <= ceiling) {
    if (rows.some((r) => isRowActiveInMonth(r, m))) months.push(m);
    m = addMonthKey(m, 1);
  }
  return months;
}

// Výchozí měsíc: poslední UZAVŘENÝ měsíc s účinnými smlouvami (finální čísla);
// když žádný takový není, nejbližší účinný (typicky probíhající měsíc).
export function defaultMonth(months: string[], today: Date): string {
  const cur = monthKeyOf(today);
  if (months.length === 0) return cur;
  const closed = months.filter((m) => m < cur);
  if (closed.length) return closed[closed.length - 1]!;
  return months.find((m) => m >= cur) ?? months[months.length - 1]!;
}

// Které celé měsíce stáhnout pro SEZÓNNÍ odhad budoucího měsíce (trailing-3 +
// jejich loňské ekvivalenty + loňský ekvivalent cíle).
function seasonalMonthsFor(targetMonth: string, today: Date): string[] {
  const cur = monthKeyOf(today);
  const set = new Set<string>();
  for (let i = 1; i <= 15; i++) set.add(addMonthKey(cur, -i));
  set.add(addMonthKey(targetMonth, -12));
  return [...set].filter((m) => m >= FEES_MIN_MONTH);
}

// ── Tržby z DW (net, nativní měna) ──────────────────────────────────────────────

const PAGE = 200;
const MAX_PAGES = 25;

// Stránkovaný sběr by-shop za libovolné datumové okno (bez waterfallu). Cachováno
// přes posQuery (klíč = razítko syncu DW + from/to), takže opakovaná okna jsou zdarma.
const _byShopRange = posQuery(
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
  "fees-by-shop-range",
);

export interface MonthNet {
  net: number;
  currency: string;
}

// Net tržba per lokalita za jedno datumové okno (součet přes pokladny lokality,
// měna z první pokladny - nativní, bez FX).
async function aggregateRangeByLocation(
  index: Awaited<ReturnType<typeof buildPairingIndex>>,
  from: string,
  to: string,
): Promise<Map<string, MonthNet>> {
  const rows = await _byShopRange(from, to);
  const byShop = new Map<string, MonthNet>();
  for (const r of rows) byShop.set(r.shop_id, { net: r.net, currency: r.currency });
  const out = new Map<string, MonthNet>();
  for (const [locationId, shopIds] of index.shopsByLocation) {
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
    if (any) out.set(locationId, { net, currency });
  }
  return out;
}

// Celé měsíce -> Map<locationId, Map<"YYYY-MM", net>> (pro sezónní odhad).
async function buildWholeMonthSeries(
  index: Awaited<ReturnType<typeof buildPairingIndex>>,
  months: string[],
): Promise<Map<string, Map<string, MonthNet>>> {
  const perMonth = await Promise.all(
    months.map(async (mk) => {
      const { from, to } = monthBounds(mk);
      return [mk, await aggregateRangeByLocation(index, from, to)] as const;
    }),
  );
  const series = new Map<string, Map<string, MonthNet>>();
  for (const [mk, locMap] of perMonth) {
    for (const [loc, v] of locMap) {
      let s = series.get(loc);
      if (!s) {
        s = new Map();
        series.set(loc, s);
      }
      s.set(mk, v);
    }
  }
  return series;
}

// ── Sezónní odhad celoměsíční tržby (budoucí měsíc) ─────────────────────────────

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

// Odhad CELOMĚSÍČNÍ net tržby pro budoucí měsíc: průměr 3 posledních uzavřených
// měsíců × (loňský cíl / průměr 3 loňských ekvivalentů); fallback průměr posledních
// (i méně); null = bez podkladu. Pro uzavřený/probíhající měsíc se NEpoužívá
// (ty mají reálná/run-rate okenní data).
export function estimateLocationNet(
  locSeries: Map<string, MonthNet> | undefined,
  target: string,
  today: Date,
): { net: number; status: "estimate"; currency: string } | null {
  if (!locSeries || locSeries.size === 0) return null;
  const cur = monthKeyOf(today);
  const anyCurrency = locSeries.values().next().value?.currency ?? "";
  const last3 = [addMonthKey(cur, -1), addMonthKey(cur, -2), addMonthKey(cur, -3)];
  const recent = last3.map((k) => locSeries.get(k)?.net).filter((n): n is number => n != null);
  if (recent.length === 0) return null;
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

// Okno periody uvnitř měsíce (clip [from, to] na hranice měsíce). "" = neaktivní.
function periodWindowInMonth(
  row: FeeRow,
  monthStart: string,
  monthEnd: string,
): { winStart: string; winEnd: string } | null {
  const from = row.from ? row.from.slice(0, 10) : "";
  const to = row.to ? row.to.slice(0, 10) : "";
  const winStart = from && from > monthStart ? from : monthStart;
  const winEnd = to && to < monthEnd ? to : monthEnd;
  if (winStart > winEnd) return null;
  return { winStart, winEnd };
}

// ── Výpočet částek + statusů pro zvolený měsíc ──────────────────────────────────

// Spočítá pro každý řádek status a částku ve zvoleném měsíci. Procentní poplatky
// berou tržbu jen za AKTIVNÍ část měsíce (od data účinnosti periody); probíhající
// měsíc = run-rate z uplynulých dní; uzavřený = reálná tržba; budoucí = sezónní
// odhad × podíl aktivních dní. Fixní (paušální) poplatky jsou vždy „final" (známe je).
export async function computeMonthResults(
  rows: FeeRow[],
  selectedMonth: string,
  today: Date,
): Promise<Map<string, FeeMonthResult>> {
  const cur = monthKeyOf(today);
  const isClosed = selectedMonth < cur;
  const isCurrent = selectedMonth === cur;
  const isFuture = selectedMonth > cur;

  const out = new Map<string, FeeMonthResult>();
  const none = (row: FeeRow): FeeMonthResult => ({ status: "none", amount: null, currency: row.currency });

  // Bez párovacího indexu / DW (degradace) -> jen sazby.
  let index: Awaited<ReturnType<typeof buildPairingIndex>>;
  try {
    index = await buildPairingIndex();
  } catch {
    for (const r of rows) out.set(r.key, none(r));
    return out;
  }

  const { from: monthStart, to: monthEnd } = monthBounds(selectedMonth);
  const todayStr = todayISO(today);
  const daysInMonth = dayCountInclusive(monthStart, monthEnd);

  // Procentní řádky aktivní v měsíci + jejich okna; sběr distinct oken k načtení.
  const windows = new Map<string, { winStart: string; winEnd: string; elapsedEnd: string }>();
  const rangeKeys = new Set<string>();
  for (const row of rows) {
    if (row.pending || !isRowActiveInMonth(row, selectedMonth)) continue;
    if (!(row.percent > 0 && row.amount === 0)) continue;
    const w = periodWindowInMonth(row, monthStart, monthEnd);
    if (!w) continue;
    const elapsedEnd = todayStr < w.winEnd ? todayStr : w.winEnd;
    windows.set(row.key, { ...w, elapsedEnd });
    if (isClosed) rangeKeys.add(`${w.winStart}|${w.winEnd}`);
    else if (isCurrent && elapsedEnd >= w.winStart) rangeKeys.add(`${w.winStart}|${elapsedEnd}`);
  }

  // Načti distinct okna paralelně (cachováno).
  const rangeNets = new Map<string, Map<string, MonthNet>>();
  try {
    await Promise.all(
      [...rangeKeys].map(async (key) => {
        const [from, to] = key.split("|");
        rangeNets.set(key, await aggregateRangeByLocation(index, from!, to!));
      }),
    );
  } catch {
    /* degradace: chybějící okna -> řádky spadnou na "none" */
  }

  // Sezónní podklad pro budoucí měsíc.
  let wholeSeries = new Map<string, Map<string, MonthNet>>();
  if (isFuture) {
    try {
      wholeSeries = await buildWholeMonthSeries(index, seasonalMonthsFor(selectedMonth, today));
    } catch {
      /* degradace */
    }
  }

  for (const row of rows) {
    if (row.pending || !isRowActiveInMonth(row, selectedMonth)) {
      out.set(row.key, none(row));
      continue;
    }
    // Fixní (paušální) částka: známe ji -> vždy "final".
    if (row.amount > 0 && row.percent === 0) {
      const amt = fixedMonthlyAmount(row, selectedMonth);
      out.set(row.key, amt == null ? none(row) : { status: "final", amount: amt, currency: row.currency });
      continue;
    }
    if (row.percent <= 0) {
      out.set(row.key, none(row));
      continue;
    }
    const w = windows.get(row.key);
    if (!w) {
      out.set(row.key, none(row));
      continue;
    }
    if (isFuture) {
      const est = estimateLocationNet(wholeSeries.get(row.locationId), selectedMonth, today);
      if (!est) {
        out.set(row.key, none(row));
        continue;
      }
      const factor = daysInMonth > 0 ? dayCountInclusive(w.winStart, w.winEnd) / daysInMonth : 1;
      out.set(row.key, {
        status: "estimate",
        amount: (est.net * factor * row.percent) / 100,
        currency: est.currency || row.currency,
      });
      continue;
    }
    if (isClosed) {
      const v = rangeNets.get(`${w.winStart}|${w.winEnd}`)?.get(row.locationId);
      out.set(row.key, !v ? none(row) : { status: "final", amount: (v.net * row.percent) / 100, currency: v.currency || row.currency });
      continue;
    }
    // Probíhající měsíc -> run-rate z uplynulé části aktivního okna.
    if (w.elapsedEnd < w.winStart) {
      out.set(row.key, none(row));
      continue;
    }
    const v = rangeNets.get(`${w.winStart}|${w.elapsedEnd}`)?.get(row.locationId);
    if (!v) {
      out.set(row.key, none(row));
      continue;
    }
    const elapsedDays = dayCountInclusive(w.winStart, w.elapsedEnd);
    const totalDays = dayCountInclusive(w.winStart, w.winEnd);
    const projected = elapsedDays > 0 ? (v.net / elapsedDays) * totalDays : v.net;
    out.set(row.key, {
      status: "estimate",
      amount: (projected * row.percent) / 100,
      currency: v.currency || row.currency,
    });
  }

  return out;
}
