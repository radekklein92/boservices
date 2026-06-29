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

  // Načti distinct okna i HISTORICKOU měsíční sérii paralelně (cachováno).
  // Historie slouží (a) pro sezónní odhad budoucích měsíců a (b) jako FALLBACK,
  // když pro zvolený měsíc ještě nejsou přímá data (run-rate/reálná tržba) - pak
  // se poplatek dopočítá z minulých tržeb, místo aby zůstal jen u sazby.
  const rangeNets = new Map<string, Map<string, MonthNet>>();
  let wholeSeries = new Map<string, Map<string, MonthNet>>();
  await Promise.all([
    Promise.all(
      [...rangeKeys].map(async (key) => {
        const [from, to] = key.split("|");
        rangeNets.set(key, await aggregateRangeByLocation(index, from!, to!));
      }),
    ).catch(() => {
      /* degradace: chybějící okna -> historický fallback / "none" */
    }),
    buildWholeMonthSeries(index, seasonalMonthsFor(selectedMonth, today))
      .then((s) => {
        wholeSeries = s;
      })
      .catch(() => {
        /* degradace */
      }),
  ]);

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
    const factor = daysInMonth > 0 ? dayCountInclusive(w.winStart, w.winEnd) / daysInMonth : 1;
    // Historický odhad (sezónní z minulých tržeb), prorátováno na aktivní část měsíce.
    // Slouží budoucím měsícům i jako FALLBACK, když pro zvolený měsíc ještě nejsou
    // přímá data (lokalita zatím bez tržby/párování v daném okně, ale má historii).
    const historical = (): FeeMonthResult => {
      const est = estimateLocationNet(wholeSeries.get(row.locationId), selectedMonth, today);
      return est
        ? { status: "estimate", amount: (est.net * factor * row.percent) / 100, currency: est.currency || row.currency }
        : none(row);
    };

    if (isFuture) {
      out.set(row.key, historical());
      continue;
    }
    if (isClosed) {
      const v = rangeNets.get(`${w.winStart}|${w.winEnd}`)?.get(row.locationId);
      out.set(
        row.key,
        v
          ? { status: "final", amount: (v.net * row.percent) / 100, currency: v.currency || row.currency }
          : historical(),
      );
      continue;
    }
    // Probíhající měsíc -> run-rate z uplynulé části aktivního okna; bez dat -> historie.
    const v =
      w.elapsedEnd >= w.winStart
        ? rangeNets.get(`${w.winStart}|${w.elapsedEnd}`)?.get(row.locationId)
        : undefined;
    if (!v) {
      out.set(row.key, historical());
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
// měsíční částka. Měsíce bez reálných dat (žádná tržba/párování) se vynechají -
// historie ukazuje jen to, co je skutečně vyčíslené. Nejnovější měsíc první.
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

  // Distinct okna (procentní řádky × měsíc) k načtení.
  const rangeKeys = new Set<string>();
  const cellWindow = new Map<string, { winStart: string; winEnd: string }>();
  for (const month of closed) {
    const { from: ms, to: me } = monthBounds(month);
    for (const row of rows) {
      if (row.pending || !isRowActiveInMonth(row, month)) continue;
      if (!(row.percent > 0 && row.amount === 0)) continue;
      const w = periodWindowInMonth(row, ms, me);
      if (!w) continue;
      cellWindow.set(`${month}:${row.key}`, w);
      rangeKeys.add(`${w.winStart}|${w.winEnd}`);
    }
  }

  const rangeNets = new Map<string, Map<string, MonthNet>>();
  try {
    await Promise.all(
      [...rangeKeys].map(async (key) => {
        const [from, to] = key.split("|");
        rangeNets.set(key, await aggregateRangeByLocation(index, from!, to!));
      }),
    );
  } catch {
    /* degradace - chybějící okna se vynechají */
  }

  const entries: FeeHistoryEntry[] = [];
  for (const month of closed) {
    const outRows: FeeHistoryRow[] = [];
    for (const row of rows) {
      if (row.pending || !isRowActiveInMonth(row, month)) continue;
      let amount: number | null = null;
      let currency = row.currency;
      if (row.amount > 0 && row.percent === 0) {
        amount = fixedMonthlyAmount(row, month);
      } else if (row.percent > 0) {
        const w = cellWindow.get(`${month}:${row.key}`);
        const v = w ? rangeNets.get(`${w.winStart}|${w.winEnd}`)?.get(row.locationId) : undefined;
        if (v) {
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
