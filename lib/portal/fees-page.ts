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
  isApprovalGated,
  type ContractType,
} from "./contract-types";
import {
  FEE_KIND_LABEL,
  displayPeriodEnd,
  formatFeePeriod,
  type FeeKind,
  type FeePeriod,
} from "./contract-fee-terms";
import * as posApi from "./pos/api";
import { posQuery } from "./pos/cache";
import { buildPairingIndex } from "./pos/pairing-db";
import { shopDailySeries } from "./pos/queries";
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
  // Proč řádek nedostal žádný poplatek (u status "none"): "no-revenue" = lokalita
  // neměla za zvolený měsíc žádnou tržbu. Podklad pro report vynechaných smluv.
  reason?: "no-revenue";
  // Započtené dny (sloupec „Dnů"): za kolik dní měsíce je částka spočtena. Fixní
  // paušál = průnik okna smlouvy s obdobím provozu prodejny; procentní = aktivní
  // okno periody, za které se bere tržba. Chybí u one-time částek a čistých
  // odhadů z historie (bez konkrétního okna).
  billedDays?: number;
  billedFrom?: string; // ISO začátek započteného období
  billedTo?: string; // ISO konec započteného období
}

// Jeden řádek reportu vynechaných smluv (mimo hlavní tabulku daného měsíce).
export interface SkippedFeeRow {
  key: string;
  locationId: string;
  locationName: string;
  clientName: string;
  contractLabel: string;
  periodLabel: string;
  rate: string;
  from: string;
  to: string;
}

// Report smluv vynechaných ve zvoleném měsíci (pro ruční kontrolu).
export interface SkippedFeesReport {
  notYetEffective: SkippedFeeRow[]; // perioda začíná až po zvoleném měsíci
  expired: SkippedFeeRow[]; // perioda skončila před zvoleným měsícem
  noRevenue: SkippedFeeRow[]; // účinná, ale bez poplatku kvůli chybějící tržbě
}

// Na stránce Poplatky stačí typ smlouvy bez varianty (A/B) - „Franšízingová".
function feeContractLabel(c: Contract): string {
  return CONTRACT_TYPE_META[c.type].shortName;
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
            to: periodEndOrDefault(c, p, franchiseEnd),
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
  // Jakákoli franšíza lokality - i bez vytažených feeTerms (ještě „zpracovává se"):
  // pak konec dopočteme z data podpisu + 10 let, ať operace/spolupráce nezůstanou
  // viset na „dle franšízové smlouvy".
  const fr = group.find((c) => c.type === "franchise");
  if (!fr) return "";
  if (fr.feeTerms?.termEndsAt) return fr.feeTerms.termEndsAt;
  const froms = (fr.feeTerms?.periods ?? []).map((p) => p.from).filter(Boolean).sort();
  const anchor = froms[0] || (clientSignedAtEffective(fr) ?? "").slice(0, 10);
  return anchor ? addMonthsISO(anchor, 120) : "";
}

// Konec periody pro zobrazení - vždy konkrétní datum. Vlastní konec periody /
// konec franšízy lokality; poslední záchrana = účinnost periody (nebo podpis
// smlouvy) + 10 let, aby se nikdy nezobrazovalo „dle franšízové smlouvy".
function periodEndOrDefault(c: Contract, p: FeePeriod, franchiseEnd: string): string {
  const e = displayPeriodEnd(p, franchiseEnd);
  if (e) return e;
  const anchor = (p.from || clientSignedAtEffective(c) || "").slice(0, 10);
  return anchor ? addMonthsISO(anchor, 120) : "";
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
  // I PROBÍHAJÍCÍ měsíc (jeho dosavadní tržba ~ téměř celý měsíc) - aby čerstvě
  // otevřená prodejna, která zatím má tržbu jen za aktuální měsíc, dostala odhad
  // (starší měsíce ještě neexistovaly).
  set.add(cur);
  for (let i = 1; i <= 15; i++) set.add(addMonthKey(cur, -i));
  set.add(addMonthKey(targetMonth, -12));
  // POZOR: žádný FEES_MIN_MONTH floor - historická tržba (i z roku 2025, kdy
  // prodejna jela pod TWIST) je platný podklad pro odhad. Floor platí jen pro
  // fakturovatelné/navigovatelné měsíce (navigableMonths), ne pro lookback tržeb.
  return [...set];
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

// ── Období provozu prodejny (pro prorátování fixních paušálů) ───────────────────

// Období, kdy byla prodejna v daném měsíci reálně V PROVOZU, odvozené z denních
// tržeb DW (split=shop). Otevře-li prodejna až v průběhu měsíce, je „v provozu"
// až od prvního dne s tržbou; skončí-li v průběhu, jen do posledního dne s tržbou.
// Zavírací dny UVNITŘ provozu (neděle, svátky) se NEkrátí - krátí se jen souvislý
// náběh/dojezd: tržba v lookaroundu PŘED měsícem = prodejna už jela -> od 1. dne;
// tržba PO měsíci (resp. probíhající měsíc) = jede dál -> do konce měsíce.
interface OpenWindow {
  openStart: string; // ISO
  openEnd: string; // ISO
}

// Jak daleko před/za měsíc se dívat, jestli prodejna běžela už dřív / běžela dál.
// Pokrývá běžné zavírací pauzy na hranicích měsíce (víkend, svátky, krátká
// dovolená) - delší mezera už se bere jako reálné otevření/zavření.
const OPEN_LOOKAROUND_DAYS = 14;

function addDaysISO(iso: string, n: number): string {
  return todayISO(new Date(isoToUTC(iso) + n * 86_400_000));
}

// Okno provozu per lokalita pro daný měsíc. V mapě chybí lokality bez jediné
// tržby v měsíci (ty řeší revenue gate); null = denní data DW nedostupná
// (degradace: nekrátit, počítat jen oknem smlouvy).
async function buildOpenWindows(
  index: Awaited<ReturnType<typeof buildPairingIndex>>,
  locationIds: ReadonlySet<string>,
  month: string,
  today: Date,
): Promise<Map<string, OpenWindow> | null> {
  const shopToLoc = new Map<string, string>();
  for (const loc of locationIds) {
    for (const sid of index.shopsByLocation.get(loc) ?? []) shopToLoc.set(sid, loc);
  }
  if (shopToLoc.size === 0) return new Map();

  const { from: monthStart, to: monthEnd } = monthBounds(month);
  const todayStr = todayISO(today);
  const fetchFrom = addDaysISO(monthStart, -OPEN_LOOKAROUND_DAYS);
  const fetchToRaw = addDaysISO(monthEnd, OPEN_LOOKAROUND_DAYS);
  const fetchTo = fetchToRaw < todayStr ? fetchToRaw : todayStr;

  let series: Awaited<ReturnType<typeof shopDailySeries>>;
  try {
    // Stabilní pořadí shop_ids -> stabilní cache klíč (posQuery klíčuje argumenty).
    series = await shopDailySeries(fetchFrom, fetchTo, [...shopToLoc.keys()].sort().join(","));
  } catch {
    return null;
  }

  // Per lokalita: tržba před měsícem / po měsíci + první a poslední den s tržbou
  // uvnitř měsíce. „Den s tržbou" = aspoň jeden doklad nebo kladná tržba (den, kdy
  // jsou jen záporné refundace, je pořád den v provozu).
  const agg = new Map<string, { before: boolean; after: boolean; first: string; last: string }>();
  for (const sr of series) {
    const loc = shopToLoc.get(sr.shop_id);
    if (!loc) continue;
    let a = agg.get(loc);
    if (!a) {
      a = { before: false, after: false, first: "", last: "" };
      agg.set(loc, a);
    }
    for (const d of sr.days) {
      if (d.receipts <= 0 && d.gross <= 0) continue;
      if (d.date < monthStart) a.before = true;
      else if (d.date > monthEnd) a.after = true;
      else {
        if (!a.first || d.date < a.first) a.first = d.date;
        if (!a.last || d.date > a.last) a.last = d.date;
      }
    }
  }

  const isClosedMonth = month < monthKeyOf(today);
  const out = new Map<string, OpenWindow>();
  for (const [loc, a] of agg) {
    if (!a.first) continue; // v měsíci žádná tržba -> žádné okno provozu
    out.set(loc, {
      openStart: a.before ? monthStart : a.first,
      // Probíhající měsíc: provoz se predikuje do konce měsíce (prodejna jede).
      openEnd: !isClosedMonth || a.after ? monthEnd : a.last,
    });
  }
  return out;
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

  // Základ = průměr NEJNOVĚJŠÍCH dostupných měsíců historie, max 3. Robustní:
  // stačí jakákoli historie (i starší / řídká). Prioritně UZAVŘENÉ měsíce (< cur),
  // aby částečný probíhající měsíc nekazil odhad zavedeným prodejnám; aktuální měsíc
  // se vezme jen jako fallback, když žádný uzavřený není (čerstvě otevřená prodejna).
  const presentMonths = [...locSeries.keys()].sort();
  const closedMonths = presentMonths.filter((m) => m < cur);
  const basisMonths = (closedMonths.length > 0 ? closedMonths : presentMonths).slice(-3);
  if (basisMonths.length === 0) return null;
  const recentAvg = avg(basisMonths.map((k) => locSeries.get(k)!.net));

  // Sezónní korekce jen když máme PŘESNĚ poslední 3 měsíce i jejich loňské
  // ekvivalenty + loňský cíl; jinak prostý průměr nejnovějších.
  const last3 = [addMonthKey(cur, -1), addMonthKey(cur, -2), addMonthKey(cur, -3)];
  const recentStrict = last3.map((k) => locSeries.get(k)?.net).filter((n): n is number => n != null);
  const equivLY = last3.map((k) => locSeries.get(addMonthKey(k, -12))?.net).filter((n): n is number => n != null);
  const netLYtarget = locSeries.get(addMonthKey(target, -12))?.net;
  if (recentStrict.length === 3 && equivLY.length === 3 && netLYtarget != null) {
    const avgEquivLY = avg(equivLY);
    const projected = avgEquivLY > 0 ? avg(recentStrict) * (netLYtarget / avgEquivLY) : recentAvg;
    return { net: projected, status: "estimate", currency: anyCurrency };
  }
  return { net: recentAvg, status: "estimate", currency: anyCurrency };
}

// Měsíční odměna z fixní částky dle periody. Paušál (monthly, resp. yearly -> /12)
// se PRORÁTUJE na počet dní, kdy byla perioda v daném měsíci reálně aktivní A
// prodejna V PROVOZU: průnik okna smlouvy (mid-month start/end) s obdobím provozu
// prodejny (`open`, viz buildOpenWindows). Když smlouva o provozování / o spolupráci
// a podpoře začne 3. a prodejna otevře až 6., účtuje se poměrová část až od 6.
// Bez `open` (DW nedostupné / budoucí měsíc) se krátí jen oknem smlouvy.
// one-time = jednorázová částka jen ve výchozím měsíci (bez prorátování a dnů).
function fixedMonthlyAmount(
  row: FeeRow,
  target: string,
  monthStart: string,
  monthEnd: string,
  open?: OpenWindow | null,
): { amount: number; billed?: { days: number; from: string; to: string } } | null {
  if (row.amountPeriod === "one-time") {
    const fromM = row.from ? row.from.slice(0, 7) : "";
    return fromM && fromM === target ? { amount: row.amount } : null;
  }
  const base = row.amountPeriod === "yearly" ? row.amount / 12 : row.amount; // monthly (default)
  const w = periodWindowInMonth(row, monthStart, monthEnd);
  if (!w) return null;
  const effStart = open && open.openStart > w.winStart ? open.openStart : w.winStart;
  const effEnd = open && open.openEnd < w.winEnd ? open.openEnd : w.winEnd;
  if (effStart > effEnd) return null; // provoz zcela mimo okno smlouvy
  const activeDays = dayCountInclusive(effStart, effEnd);
  const inMonth = dayCountInclusive(monthStart, monthEnd);
  const factor = inMonth > 0 ? activeDays / inMonth : 1;
  return {
    amount: base * factor,
    billed: { days: activeDays, from: effStart, to: effEnd },
  };
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
// berou tržbu jen za AKTIVNÍ část měsíce (od data účinnosti periody):
//   - uzavřený měsíc = JEN reálná tržba; když žádná tržba nebyla, žádný odhad (jen
//     sazba) - měsíc je uzavřený, počítá se výhradně to, co se reálně prodalo,
//   - probíhající měsíc = run-rate z UZAVŘENÝCH dní (do včerejška) - rozehraný dnešek
//     by denní průměr uměle podstřeloval; dokud v měsíci není žádná uzavřená tržba,
//     historický odhad ZTENČENÝ o už uzavřené dny bez tržby (postupně klesá k nule),
//   - budoucí měsíc = sezónní odhad × podíl aktivních dní.
// Fixní (paušální) poplatky jsou „final", ale JEN když prodejna měla za měsíc reálnou
// tržbu - platí pro VŠECHNY typy smluv vč. FRANŠÍZY (franšíza už není výjimka): bez
// tržby negenerují žádný poplatek (status "none", reason "no-revenue"). Částka se
// navíc prorátuje na dny, kdy smlouva platila A prodejna byla v provozu (průnik,
// viz buildOpenWindows) - prodejna otevřená až od poloviny měsíce platí jen poměr.
// Budoucí měsíc reálnou tržbu nezná -> fixní poplatek se ukáže jako „final" (známá
// částka, krácená jen platností smlouvy).
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
  const none = (row: FeeRow, reason?: "no-revenue"): FeeMonthResult => ({
    status: "none",
    amount: null,
    currency: row.currency,
    reason,
  });

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
  // Poslední UZAVŘENÝ den (včerejšek) - run-rate procentních poplatků extrapoluje
  // jen z celých dnů; dnešek je rozehraný a v průměru by uměle podstřeloval.
  const closedEndStr = addDaysISO(todayStr, -1);
  const daysInMonth = dayCountInclusive(monthStart, monthEnd);

  // Řádky, které potřebují znát tržbu za okno v měsíci: procentní poplatky + smlouvy
  // o spolupráci/provozování (revenue-gated). Spočti jim okno a nasbírej distinct
  // rozsahy k načtení z DW.
  const windows = new Map<string, { winStart: string; winEnd: string; elapsedEnd: string }>();
  const rangeKeys = new Set<string>();
  // Lokality s fixním MĚSÍČNÍM paušálem (monthly/yearly) - pro ně se navíc táhne
  // okno provozu prodejny (buildOpenWindows), aby se paušál krátil i podle dnů,
  // kdy byla prodejna reálně otevřená (ne jen podle platnosti smlouvy).
  const fixedLocationIds = new Set<string>();
  for (const row of rows) {
    if (row.pending || !isRowActiveInMonth(row, selectedMonth)) continue;
    // Okno tržby potřebuje KAŽDÝ účtovatelný řádek: procentní pro výpočet částky,
    // fixní pro revenue gate (bez tržby = žádný poplatek ani u fixní/paušální sazby).
    const needsRevenue = row.percent > 0 || row.amount > 0;
    if (!needsRevenue) continue;
    const w = periodWindowInMonth(row, monthStart, monthEnd);
    if (!w) continue;
    // Procentní řádky: jen uzavřené dny (run-rate). Fixní řádky: včetně dneška -
    // revenue gate má paušál ukázat hned, jak prodejna v měsíci poprvé namarkuje.
    const endStr = row.percent > 0 ? closedEndStr : todayStr;
    const elapsedEnd = endStr < w.winEnd ? endStr : w.winEnd;
    windows.set(row.key, { ...w, elapsedEnd });
    if (isClosed) rangeKeys.add(`${w.winStart}|${w.winEnd}`);
    else if (isCurrent && elapsedEnd >= w.winStart) rangeKeys.add(`${w.winStart}|${elapsedEnd}`);
    if (!isFuture && row.amount > 0 && row.percent === 0 && row.amountPeriod !== "one-time") {
      fixedLocationIds.add(row.locationId);
    }
  }

  // Načti distinct okna i HISTORICKOU měsíční sérii paralelně (cachováno).
  // Historie slouží (a) pro sezónní odhad budoucích měsíců a (b) jako FALLBACK pro
  // PROBÍHAJÍCÍ měsíc, dokud v něm ještě není žádná tržba (odhad se dopočítá z minulých
  // tržeb, ztenčený o už uplynulé dny bez tržby). Pro UZAVŘENÝ měsíc historii vůbec
  // netáhneme - počítá se výhradně reálná tržba (žádný odhad).
  const rangeNets = new Map<string, Map<string, MonthNet>>();
  let wholeSeries = new Map<string, Map<string, MonthNet>>();
  const [, , openWindows] = await Promise.all([
    Promise.all(
      [...rangeKeys].map(async (key) => {
        const [from, to] = key.split("|");
        rangeNets.set(key, await aggregateRangeByLocation(index, from!, to!));
      }),
    ).catch(() => {
      /* degradace: chybějící okna -> historický fallback / "none" */
    }),
    isClosed
      ? Promise.resolve()
      : buildWholeMonthSeries(index, seasonalMonthsFor(selectedMonth, today))
          .then((s) => {
            wholeSeries = s;
          })
          .catch(() => {
            /* degradace */
          }),
    // Okna provozu pro fixní paušály (budoucí měsíc tržby nezná -> bez krácení;
    // null = degradace -> krátí se jen oknem smlouvy).
    isFuture
      ? Promise.resolve(null)
      : buildOpenWindows(index, fixedLocationIds, selectedMonth, today).catch(() => null),
  ]);

  // Sezónní odhad z historie prorátovaný `factor`em na relevantní část měsíce
  // (budoucí měsíc = celé aktivní okno; probíhající měsíc bez tržby = jen ZBÝVAJÍCÍ
  // dny). factor <= 0 (nic nezbývá) nebo chybějící historie -> žádný odhad.
  const historicalEstimate = (row: FeeRow, factor: number): FeeMonthResult => {
    if (factor <= 0) return none(row);
    const est = estimateLocationNet(wholeSeries.get(row.locationId), selectedMonth, today);
    return est
      ? { status: "estimate", amount: (est.net * factor * row.percent) / 100, currency: est.currency || row.currency }
      : none(row);
  };

  // Reálná net tržba lokality za relevantní okno (uzavřený měsíc = celé okno,
  // probíhající = uplynulá část); null pro budoucí měsíc (tam se tržba negatuje).
  const windowRevenueNet = (
    row: FeeRow,
    w: { winStart: string; winEnd: string; elapsedEnd: string },
  ): number | null => {
    if (isClosed) return rangeNets.get(`${w.winStart}|${w.winEnd}`)?.get(row.locationId)?.net ?? null;
    if (isCurrent && w.elapsedEnd >= w.winStart)
      return rangeNets.get(`${w.winStart}|${w.elapsedEnd}`)?.get(row.locationId)?.net ?? null;
    return null;
  };

  for (const row of rows) {
    if (row.pending || !isRowActiveInMonth(row, selectedMonth)) {
      out.set(row.key, none(row));
      continue;
    }

    const hasFixed = row.amount > 0 && row.percent === 0;
    const hasPercent = row.percent > 0;
    if (!hasFixed && !hasPercent) {
      out.set(row.key, none(row)); // bez sazby (nelze nic spočítat) - ne kvůli tržbě
      continue;
    }

    const w = windows.get(row.key);

    // Bez reálné tržby za měsíc se FIXNÍ (paušální) poplatek NEFAKTURUJE - u žádného
    // typu smlouvy (spolupráce, provozování i FRANŠÍZA). Franšíza už NENÍ výjimka:
    // když prodejna za měsíc nic neprodala, negeneruje ani franšízový paušál. Procentní
    // poplatek si tržbu řeší vlastní větví níž (vč. průběžného odhadu), sem nepatří.
    if (hasFixed && !isFuture && w) {
      const net = windowRevenueNet(row, w);
      if (net == null || net <= 0) {
        out.set(row.key, none(row, "no-revenue"));
        continue;
      }
    }

    // Fixní (paušální) částka: známe ji -> "final" (revenue gate výše už proběhl).
    // Prorátuje se na PRŮNIK aktivní části měsíce (mid-month start/end smlouvy)
    // s obdobím provozu prodejny - když prodejna otevřela až po účinnosti smlouvy
    // (nebo zavřela dřív), počítá se jen poměrová část za dny reálného provozu.
    if (hasFixed) {
      const open = openWindows?.get(row.locationId) ?? null;
      const r = fixedMonthlyAmount(row, selectedMonth, monthStart, monthEnd, open);
      out.set(
        row.key,
        r == null
          ? none(row)
          : {
              status: "final",
              amount: r.amount,
              currency: row.currency,
              billedDays: r.billed?.days,
              billedFrom: r.billed?.from,
              billedTo: r.billed?.to,
            },
      );
      continue;
    }

    // Procentní poplatek.
    if (!w) {
      out.set(row.key, none(row));
      continue;
    }
    const totalDays = dayCountInclusive(w.winStart, w.winEnd);

    // Budoucí měsíc: kvalifikovaný sezónní odhad z historie, prorátovaný na aktivní
    // okno periody v měsíci.
    if (isFuture) {
      out.set(row.key, historicalEstimate(row, daysInMonth > 0 ? totalDays / daysInMonth : 1));
      continue;
    }

    // Uzavřený měsíc: počítá se VÝHRADNĚ reálná tržba. Když za měsíc žádná tržba nebyla
    // (lokalita chybí v DW nebo net <= 0), poplatek se NEODHADUJE - měsíc je uzavřený,
    // finální je jen to, co se reálně prodalo (žádný „Odhad", jen sazba).
    if (isClosed) {
      const v = rangeNets.get(`${w.winStart}|${w.winEnd}`)?.get(row.locationId);
      out.set(
        row.key,
        v && v.net > 0
          ? {
              status: "final",
              amount: (v.net * row.percent) / 100,
              currency: v.currency || row.currency,
              billedDays: totalDays,
              billedFrom: w.winStart,
              billedTo: w.winEnd,
            }
          : none(row, "no-revenue"),
      );
      continue;
    }

    // Probíhající měsíc.
    const elapsedDays = w.elapsedEnd >= w.winStart ? dayCountInclusive(w.winStart, w.elapsedEnd) : 0;
    const v =
      elapsedDays > 0 ? rangeNets.get(`${w.winStart}|${w.elapsedEnd}`)?.get(row.locationId) : undefined;
    if (v && v.net > 0) {
      // Run-rate z UZAVŘENÉ části okna (do včerejška). Dělení VŠEMI uzavřenými dny
      // (i těmi bez tržby) samo snižuje odhad úměrně počtu dnů, kdy se nic neprodalo.
      const projected = (v.net / elapsedDays) * totalDays;
      out.set(row.key, {
        status: "estimate",
        amount: (projected * row.percent) / 100,
        currency: v.currency || row.currency,
        billedDays: totalDays,
        billedFrom: w.winStart,
        billedTo: w.winEnd,
      });
      continue;
    }
    // Zatím žádná tržba v uzavřených dnech měsíce -> odhad z historie, ale ZTENČENÝ
    // o už uzavřené dny bez tržby (počítá se na zbývající dny vč. dneška). Jak měsíc
    // běží dál bez tržby, odhad postupně klesá; po posledním dni -> žádný odhad.
    // Když ani historie není (nelze odhadnout), řádek je vynechán kvůli chybějící tržbě.
    const remainingDays = totalDays - elapsedDays;
    const est = historicalEstimate(row, daysInMonth > 0 ? remainingDays / daysInMonth : 0);
    out.set(row.key, est.status === "none" ? none(row, "no-revenue") : est);
  }

  return out;
}

// Sestaví report smluv VYNECHANÝCH ve zvoleném měsíci (pro ruční kontrolu): které
// ještě nebyly účinné, které už expirovaly a které jsou účinné, ale nevygenerovaly
// poplatek kvůli chybějící tržbě (reason "no-revenue" z computeMonthResults). Pending
// (nezpracované) řádky se nezahrnují.
export function buildSkippedFeesReport(
  rows: FeeRow[],
  results: Map<string, FeeMonthResult>,
  month: string,
): SkippedFeesReport {
  const notYetEffective: SkippedFeeRow[] = [];
  const expired: SkippedFeeRow[] = [];
  const noRevenue: SkippedFeeRow[] = [];
  const map = (row: FeeRow): SkippedFeeRow => ({
    key: row.key,
    locationId: row.locationId,
    locationName: row.locationName,
    clientName: row.clientName,
    contractLabel: row.contractLabel,
    periodLabel: row.periodLabel,
    rate: row.rate,
    from: row.from,
    to: row.to,
  });
  for (const row of rows) {
    if (row.pending) continue;
    const fromM = row.from ? row.from.slice(0, 7) : "";
    const toM = row.to ? row.to.slice(0, 7) : "";
    if (fromM && month < fromM) {
      notYetEffective.push(map(row));
    } else if (toM && month > toM) {
      expired.push(map(row));
    } else if (results.get(row.key)?.reason === "no-revenue") {
      noRevenue.push(map(row));
    }
  }
  const byLoc = (a: SkippedFeeRow, b: SkippedFeeRow) =>
    a.locationName.localeCompare(b.locationName, "cs");
  // Ještě neúčinné řadíme podle data účinnosti (sloupec „Od") vzestupně - ať jsou
  // nejdřív ty, které nabydou účinnosti nejdřív; shodné datum -> podle lokality.
  // `from` je ISO YYYY-MM-DD, takže prosté řetězcové porovnání je chronologické.
  notYetEffective.sort(
    (a, b) => (a.from || "").localeCompare(b.from || "") || byLoc(a, b),
  );
  expired.sort(byLoc);
  noRevenue.sort(byLoc);
  return { notYetEffective, expired, noRevenue };
}

// ── Historie finálních poplatků za uzavřené měsíce ──────────────────────────────

export interface FeeHistoryRow {
  key: string;
  locationName: string;
  contractLabel: string;
  periodLabel: string;
  amount: number;
  currency: string;
}

export interface FeeHistoryEntry {
  month: string; // "YYYY-MM"
  rows: FeeHistoryRow[];
  totals: [string, number][]; // [měna, součet]
}

// Historie REÁLNÝCH (finálních) poplatků za uzavřené měsíce pro dané smlouvy
// (detail lokality = smlouvy lokality, detail klienta = všechny jeho smlouvy).
// Procentní poplatek = % × reálná tržba bez DPH za aktivní část měsíce; fixní =
// měsíční částka krácená na dny platnosti smlouvy a PROVOZU prodejny (měsíc bez
// tržby paušál negeneruje - shodně se stránkou Poplatky). Měsíce bez reálných dat
// (žádná tržba/párování) se vynechají - historie ukazuje jen to, co je skutečně
// vyčíslené. Nejnovější měsíc první.
export async function buildFeeHistory(
  contracts: Contract[],
  today: Date,
): Promise<FeeHistoryEntry[]> {
  const rows = buildFeeRows(contracts);
  const cur = monthKeyOf(today);
  const lastClosed = addMonthKey(cur, -1);
  const closed: string[] = [];
  let m = FEES_MIN_MONTH;
  while (m <= lastClosed) {
    if (rows.some((r) => isRowActiveInMonth(r, m))) closed.push(m);
    m = addMonthKey(m, 1);
  }
  if (closed.length === 0) return [];

  let index: Awaited<ReturnType<typeof buildPairingIndex>>;
  try {
    index = await buildPairingIndex();
  } catch {
    return [];
  }

  // Distinct okna (procentní řádky × měsíc) k načtení + lokality s fixním
  // paušálem per měsíc (pro okna provozu prodejny - krácení jako na Poplatcích).
  const rangeKeys = new Set<string>();
  const cellWindow = new Map<string, { winStart: string; winEnd: string }>();
  const fixedLocsByMonth = new Map<string, Set<string>>();
  for (const month of closed) {
    const { from: ms, to: me } = monthBounds(month);
    for (const row of rows) {
      if (row.pending || !isRowActiveInMonth(row, month)) continue;
      if (row.amount > 0 && row.percent === 0 && row.amountPeriod !== "one-time") {
        let s = fixedLocsByMonth.get(month);
        if (!s) {
          s = new Set();
          fixedLocsByMonth.set(month, s);
        }
        s.add(row.locationId);
      }
      if (!(row.percent > 0 && row.amount === 0)) continue;
      const w = periodWindowInMonth(row, ms, me);
      if (!w) continue;
      cellWindow.set(`${month}:${row.key}`, w);
      rangeKeys.add(`${w.winStart}|${w.winEnd}`);
    }
  }

  const rangeNets = new Map<string, Map<string, MonthNet>>();
  const openByMonth = new Map<string, Map<string, OpenWindow> | null>();
  try {
    await Promise.all([
      ...[...rangeKeys].map(async (key) => {
        const [from, to] = key.split("|");
        rangeNets.set(key, await aggregateRangeByLocation(index, from!, to!));
      }),
      ...[...fixedLocsByMonth].map(async ([month, locs]) => {
        openByMonth.set(month, await buildOpenWindows(index, locs, month, today));
      }),
    ]);
  } catch {
    /* degradace - chybějící okna se vynechají */
  }

  const entries: FeeHistoryEntry[] = [];
  for (const month of closed) {
    const { from: ms, to: me } = monthBounds(month);
    const outRows: FeeHistoryRow[] = [];
    for (const row of rows) {
      if (row.pending || !isRowActiveInMonth(row, month)) continue;
      let amount: number | null = null;
      let currency = row.currency;
      if (row.amount > 0 && row.percent === 0) {
        // Shodně se stránkou Poplatky: měsíc bez jediné tržby fixní paušál
        // negeneruje (pokud denní data máme); jinak krácení na dny provozu.
        const open = openByMonth.get(month) ?? null;
        const skipNoRevenue =
          open != null && row.amountPeriod !== "one-time" && !open.has(row.locationId);
        if (!skipNoRevenue) {
          amount =
            fixedMonthlyAmount(row, month, ms, me, open?.get(row.locationId) ?? null)?.amount ??
            null;
        }
      } else if (row.percent > 0) {
        const w = cellWindow.get(`${month}:${row.key}`);
        const v = w ? rangeNets.get(`${w.winStart}|${w.winEnd}`)?.get(row.locationId) : undefined;
        if (v && v.net > 0) {
          amount = (v.net * row.percent) / 100;
          currency = v.currency || row.currency;
        }
      }
      if (amount == null) continue;
      outRows.push({
        key: `${month}:${row.key}`,
        locationName: row.locationName,
        contractLabel: row.contractLabel,
        periodLabel: row.periodLabel,
        amount,
        currency,
      });
    }
    if (outRows.length === 0) continue;
    const tot = new Map<string, number>();
    for (const r of outRows) tot.set(r.currency, (tot.get(r.currency) ?? 0) + r.amount);
    entries.push({ month, rows: outRows, totals: [...tot.entries()] });
  }

  return entries.reverse();
}
