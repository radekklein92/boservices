import "server-only";
// Cachovaná read vrstva POS dashboardu nad API klientem (api.ts). Každý dotaz je
// obalený posQuery -> Next data cache zarovnaná na sync DW (viz cache.ts).
//
// MĚNA / FX: DW vrací řádky pro VŠECHNY měny (každý nese vlastní currency). Portál
// si je stáhne JEDNOU (currency se do DW NEposílá -> jedna cache nezávislá na
// zvolené měně) a per request je přepočte do zvolené zobrazovací měny
// (filter.currency) přes ČNB kurzy (fx.ts), teprve PAK agreguje. Díky tomu se
// "vše přepočítá" do jedné měny napříč prodejnami i koncepty.
//
// MULTI-SELECT: DW API umí filtrovat jen jedním brand_id/shop_id, ne množinou.
// Výběr prodejen/konceptů proto rozkládáme přes pairing index na množinu pokladen
// (selection.ts) a:
//   - KPI souhrn, období, žebříček PRODEJEN i KONCEPTŮ = portálový ROLLUP nad
//     /revenue/by-shop (jeden dotaz vrátí všechny pokladny -> sečteme dle párování).
//   - Denní trend = brand-grain pro celé značky, jinak fanout po pokladnách (strop).
//   - Produkty/účtenky/analytics = jeden shop_id (1 pokladna) nebo shop_ids (CSV,
//     doplněno do DW); pro "vše" bez filtru. scopeApiParams to řeší.
import { cache } from "react";
import * as api from "./api";
import { posQuery, posStaticQuery } from "./cache";
import { getFxRates, convertRows, fxFactor, hasRate, type FxRates } from "./fx";
import {
  clampWindow,
  clampLimit,
  clampPage,
  MAX_RAW_WINDOW_DAYS,
  MAX_DAILY_SHOP_FANOUT,
} from "./guards";
import {
  addDays,
  isAllSelection,
  resolveComparisonRange,
  resolveDateRange,
  type DateRange,
  type PosDatePreset,
  type PosFilter,
} from "./filters";
import { buildPairingIndex, type PairingIndex } from "./pairing-db";
import { rollupSummary, computeLfl } from "./aggregate";
import { resolveSelection, conceptOfShop, type ResolvedSelection } from "./selection";
import { cachedListLocations } from "@/lib/portal/cached-db";
import type { MirroredLocation, LocationConcept } from "@/lib/portal/locations-db";
import type {
  ApiBrand,
  ApiShop,
  BrandRevenueRow,
  BrandRevenueRowWithPrev,
  CityRevenueRowWithPrev,
  ConceptRevenueRowWithPrev,
  DailyRevenueRow,
  DaypartRow,
  DayPoint,
  HeatmapCell,
  HourPoint,
  KpiSummary,
  LiveMoverRow,
  LiveMovers,
  LocationRevenueRowWithPrev,
  Paged,
  PaymentMixRow,
  ProductDetail,
  ProductDayRow,
  ProductLocationRow,
  ProductSalesRow,
  ProductShopRow,
  ReceiptDetail,
  ReceiptListItem,
  ReceiptListRow,
  ShopRevenueRow,
  SummaryRow,
  TodayRow,
  VatSplitRow,
} from "./types";

function aggWindow(filter: PosFilter): DateRange {
  return clampWindow(resolveDateRange(filter)).range;
}

function rawWindow(filter: PosFilter): DateRange {
  return clampWindow(resolveDateRange(filter), MAX_RAW_WINDOW_DAYS).range;
}

// --- Peněžní pole jednotlivých typů (pro FX přepočet; počty/qty se nepřevádějí) ---
const SHOP_MONEY: readonly (keyof ShopRevenueRow)[] = ["gross", "net", "vat", "refunds"];
const DAILY_MONEY: readonly (keyof DailyRevenueRow)[] = ["gross", "net", "vat"];
const HEATMAP_MONEY: readonly (keyof HeatmapCell)[] = ["gross", "net"];
const DAYPART_MONEY: readonly (keyof DaypartRow)[] = ["gross", "net"];
const VAT_MONEY: readonly (keyof VatSplitRow)[] = ["gross", "net", "vat"];
const PAYMIX_MONEY: readonly (keyof PaymentMixRow)[] = ["total"];
const RECEIPT_MONEY: readonly (keyof ReceiptListRow)[] = ["gross", "net", "vat"];
const BRAND_MONEY: readonly (keyof BrandRevenueRow)[] = ["gross", "net", "vat"];
const PRODUCT_MONEY: readonly (keyof ProductSalesRow)[] = ["gross", "net", "vat"];
const PRODUCT_SHOP_MONEY: readonly (keyof ProductShopRow)[] = ["gross", "net", "vat"];
const PRODUCT_DAY_MONEY: readonly (keyof ProductDayRow)[] = ["gross", "net"];

// Sečte per-měnové SummaryRow do JEDNOHO řádku v cílové měně (převod přes FX).
// refund_rate se kombinuje jako vážený průměr přes (převedený) gross. Prázdný
// vstup -> [] (stránka pak ukáže "nejsou data"); jinak vždy jeden řádek.
function sumSummaryRows(rows: SummaryRow[], to: string, rates: FxRates): SummaryRow[] {
  if (rows.length === 0) return [];
  let gross = 0;
  let net = 0;
  let vat = 0;
  let receipts = 0;
  let refundWeighted = 0;
  let refundBase = 0;
  let hasRefund = false;
  let included = 0;
  for (const r of rows) {
    if (!hasRate(r.currency, rates)) continue; // vynech nepřevoditelné (AED apod.)
    included++;
    const f = fxFactor(r.currency, to, rates);
    gross += r.gross * f;
    net += r.net * f;
    vat += r.vat * f;
    receipts += r.receipts;
    if (r.refund_rate != null) {
      hasRefund = true;
      refundWeighted += r.refund_rate * r.gross * f;
      refundBase += r.gross * f;
    }
  }
  if (included === 0) return [];
  return [
    {
      currency: to,
      gross,
      net,
      vat,
      receipts,
      avg_ticket: receipts > 0 ? gross / receipts : null,
      refund_rate: hasRefund && refundBase > 0 ? refundWeighted / refundBase : null,
    },
  ];
}

// Sečte per-měnové TodayRow do jednoho řádku v cílové měně. Prázdný vstup -> [].
function sumTodayRows(rows: TodayRow[], to: string, rates: FxRates): TodayRow[] {
  if (rows.length === 0) return [];
  let gross = 0;
  let net = 0;
  let receipts = 0;
  let asOf = "";
  let included = 0;
  for (const r of rows) {
    if (!hasRate(r.currency, rates)) continue; // vynech nepřevoditelné (AED apod.)
    included++;
    const f = fxFactor(r.currency, to, rates);
    gross += r.gross * f;
    net += r.net * f;
    receipts += r.receipts;
    if (r.as_of > asOf) asOf = r.as_of;
  }
  if (included === 0) return [];
  return [{ currency: to, gross, net, receipts, as_of: asOf }];
}

// Sběr stránkovaného endpointu BEZ waterfallu: 1. strana odhalí total, zbytek se
// dotáhne PARALELNĚ. (Dřív se stránky tahaly sekvenčně = N × round-trip.)
const PAGE_SIZE = 200;
const MAX_PAGES = 25; // pojistka proti runaway
async function collectPaged<T>(
  fetchPage: (page: number) => Promise<Paged<T>>,
): Promise<T[]> {
  const first = await fetchPage(0);
  const total = first.meta?.total ?? first.data.length;
  const pages = Math.min(MAX_PAGES, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return first.data;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => fetchPage(i + 1)),
  );
  return [...first.data, ...rest.flatMap((r) => r.data)];
}

// --- Číselníky (pro filtr/scope) ---

const _brands = posStaticQuery(() => api.getBrands(), "brands");
export async function getBrands(): Promise<ApiBrand[]> {
  return (await _brands()).data;
}

async function collectShops(): Promise<ApiShop[]> {
  return collectPaged((page) => api.listShops({ page, limit: PAGE_SIZE }));
}
const _allShops = posStaticQuery(() => collectShops(), "all-shops");
// Pobočky pro UI - bez AED (124 účtenek, nemá ČNB kurz a kontaminovala by součty).
// Pokladny s "test" v názvu se ZÁMĚRNĚ NEodfiltrovávají: i živá prodejna se může
// dočasně používat na testy, takže by jinak zmizela z párování i žebříčků. Skutečně
// neprodejní kasy se vyřazují per-pokladna přes "ignorovat" v párování. Cachované.
export async function getAllShops(): Promise<ApiShop[]> {
  return (await _allShops()).filter((s) => s.currency_code !== "AED");
}

// --- Scope kontext (resolver + indexy), dedup per request přes React cache ---

const _pairingIndex = cache(() => buildPairingIndex());
const _locations = cache(() => cachedListLocations());

interface ScopeContext {
  shops: ApiShop[];
  locations: MirroredLocation[];
  index: PairingIndex;
  resolved: ResolvedSelection;
  // Cílová ZOBRAZOVACÍ měna = filter.currency. Všechny částky z DW se do ní
  // přepočtou přes FX (fx.ts) ještě před agregací.
  currency: string;
}

async function scopeContext(filter: PosFilter): Promise<ScopeContext> {
  const [shops, index, locations] = await Promise.all([getAllShops(), _pairingIndex(), _locations()]);
  const resolved = resolveSelection(filter.selection, index, shops);
  return { shops, index, locations, resolved, currency: filter.currency };
}

// Měna, ve které se zobrazují peníze (labely, formátování) = zvolená zobrazovací
// měna. Vše se do ní přepočítá přes FX, takže není potřeba žádný fallback.
export async function resolveDisplayCurrency(filter: PosFilter): Promise<string> {
  return filter.currency;
}

// Parametry pro single-endpointy (produkty/účtenky/analytics). DW umí shop_ids
// (CSV, WHERE shop_id = ANY; nasazeno - rontoday/bo-service PR #28). Mapování:
//   vše               -> {} (bez filtru)
//   1 pokladna        -> shop_id
//   1 celá značka     -> brand_id (kratší dotaz než výčet pokladen)
//   víc pokladen      -> shop_ids (CSV)
//   prázdný výběr     -> __empty
function scopeApiParams(
  resolved: ResolvedSelection,
): { brand_id?: string; shop_id?: string; shop_ids?: string; __empty?: boolean } {
  if (resolved.isAll) return {};
  const ids = [...resolved.shopIds];
  if (ids.length === 0) return { __empty: true };
  if (ids.length === 1) return { shop_id: ids[0] };
  if (resolved.brandsPresent.length === 1 && resolved.coversWholeBrands.includes(resolved.brandsPresent[0])) {
    return { brand_id: resolved.brandsPresent[0] };
  }
  return { shop_ids: ids.join(",") };
}

// --- KPI souhrn ---
// "Vše" jede přes /revenue/summary (přesné, vč. refund_rate, všechny měny -> FX
// součet). Výběr se ROLLUPuje z /revenue/by-shop (přesné gross/net/vat/receipts;
// refund_rate jen pokud DW vrací `refunds` per pokladna, jinak null = degradace).

const _summary = posQuery(
  (from: string, to: string, brand_id?: string, shop_id?: string) =>
    api.getRevenueSummary({ date_from: from, date_to: to, brand_id, shop_id }),
  "summary",
);

export async function getKpiSummary(filter: PosFilter): Promise<KpiSummary> {
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const to = filter.currency;
  const rates = await getFxRates();

  if (isAllSelection(filter.selection)) {
    // All-store číslo (zobrazení) z přesného /summary; like-for-like základ delty z
    // per-pokladna /by-shop (na Přehledu i v cronu cache HIT - leaderboard ho tahá taky).
    const { resolved, index } = await scopeContext(filter);
    const [cur, prev, curRev, prevRev] = await Promise.all([
      _summary(range.from, range.to),
      _summary(cmp.from, cmp.to),
      _shopRev(range.from, range.to),
      _shopRev(cmp.from, cmp.to),
    ]);
    const curC = convertRows(curRev, to, rates, SHOP_MONEY);
    const prevC = convertRows(prevRev, to, rates, SHOP_MONEY);
    const lfl = computeLfl(curC, prevC, resolved.shopIds, (id) => locationKeyOf(id, index), to);
    return {
      current: sumSummaryRows(cur.data, to, rates),
      comparison: sumSummaryRows(prev.data, to, rates),
      lflCurrent: lfl.lflCurrent ? [lfl.lflCurrent] : null,
      lflComparison: lfl.lflComparison ? [lfl.lflComparison] : null,
    };
  }

  const { resolved, index } = await scopeContext(filter);
  if (resolved.shopIds.size === 0)
    return { current: [], comparison: [], lflCurrent: null, lflComparison: null };
  const [cur, prev] = await Promise.all([_shopRev(range.from, range.to), _shopRev(cmp.from, cmp.to)]);
  const curC = convertRows(cur, to, rates, SHOP_MONEY);
  const prevC = convertRows(prev, to, rates, SHOP_MONEY);
  const lfl = computeLfl(curC, prevC, resolved.shopIds, (id) => locationKeyOf(id, index), to);
  return {
    current: [rollupSummary(curC, resolved.shopIds, to)],
    comparison: [rollupSummary(prevC, resolved.shopIds, to)],
    lflCurrent: lfl.lflCurrent ? [lfl.lflCurrent] : null,
    lflComparison: lfl.lflComparison ? [lfl.lflComparison] : null,
  };
}

// Souhrn za pevná období (Dnes / Tento týden / Tento měsíc / Tento rok) ve scope
// a zvolené měně - pro boční panel na Přehledu.
const PERIOD_PRESETS: { key: PosDatePreset; label: string }[] = [
  { key: "dnes", label: "Dnes" },
  { key: "tento-tyden", label: "Tento týden" },
  { key: "tento-mesic", label: "Tento měsíc" },
  { key: "tento-rok", label: "Tento rok" },
];

export async function getPeriodTotals(
  filter: PosFilter,
): Promise<{ key: PosDatePreset; label: string; net: number; gross: number; receipts: number }[]> {
  const to = filter.currency;
  const rates = await getFxRates();

  if (isAllSelection(filter.selection)) {
    return Promise.all(
      PERIOD_PRESETS.map(async (p) => {
        const range = resolveDateRange({ ...filter, preset: p.key });
        const data = (await _summary(range.from, range.to)).data;
        const s = sumSummaryRows(data, to, rates)[0];
        return { key: p.key, label: p.label, net: s?.net ?? 0, gross: s?.gross ?? 0, receipts: s?.receipts ?? 0 };
      }),
    );
  }

  const { resolved } = await scopeContext(filter);
  return Promise.all(
    PERIOD_PRESETS.map(async (p) => {
      const range = resolveDateRange({ ...filter, preset: p.key });
      const rows = convertRows(await _shopRev(range.from, range.to), to, rates, SHOP_MONEY);
      const s = rollupSummary(rows, resolved.shopIds, to);
      return { key: p.key, label: p.label, net: s.net, gross: s.gross, receipts: s.receipts };
    }),
  );
}

// --- Denní trend (/v1/revenue/daily) ---
// by-shop nemá denní rozpad a daily neumí množinu shop_id. Plán dle výběru:
//   all              -> brand-grain (jeden dotaz, všechny značky)
//   celé značky      -> brand-grain per dotčená značka
//   málo pokladen    -> fanout po pokladnách (<= strop)
//   hodně částečných -> degradace (graf prázdný; KPI/žebříčky zůstávají přesné)

async function collectDaily(p: {
  date_from: string;
  date_to: string;
  brand_id?: string;
  shop_id?: string;
}): Promise<DailyRevenueRow[]> {
  return collectPaged((page) => api.getRevenueDaily({ ...p, page, limit: PAGE_SIZE }));
}

const _dailyTrend = posQuery(
  (from: string, to: string, brand_id?: string, shop_id?: string) =>
    collectDaily({ date_from: from, date_to: to, brand_id, shop_id }),
  "daily-trend",
);

function foldDaily(rows: DailyRevenueRow[]): DayPoint[] {
  const byDate = new Map<string, DayPoint>();
  for (const r of rows) {
    const d = byDate.get(r.date) ?? { date: r.date, gross: 0, net: 0, receipts: 0 };
    d.gross += r.gross;
    d.net += r.net;
    d.receipts += r.receipts;
    byDate.set(r.date, d);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

type DailyPlan =
  | { mode: "all" }
  | { mode: "brands"; brands: string[] }
  | { mode: "shops"; shops: string[] }
  | { mode: "degraded" };

function dailyPlan(resolved: ResolvedSelection, shops: ApiShop[]): DailyPlan {
  if (resolved.isAll) return { mode: "all" };
  const shopIds = resolved.shopIds;
  if (shopIds.size === 0) return { mode: "shops", shops: [] };
  const whole = new Set(resolved.coversWholeBrands);
  const brandByShop = new Map(shops.map((s) => [s.id, s.brand_id]));
  const brandsInSel = new Set<string>();
  let allWhole = true;
  for (const id of shopIds) {
    const b = brandByShop.get(id);
    if (b && whole.has(b)) brandsInSel.add(b);
    else allWhole = false;
  }
  if (allWhole && brandsInSel.size > 0) return { mode: "brands", brands: [...brandsInSel] };
  if (shopIds.size <= MAX_DAILY_SHOP_FANOUT) return { mode: "shops", shops: [...shopIds] };
  return { mode: "degraded" };
}

async function dailyRows(plan: DailyPlan, range: DateRange): Promise<DailyRevenueRow[]> {
  if (plan.mode === "all") return _dailyTrend(range.from, range.to);
  if (plan.mode === "degraded") return [];
  if (plan.mode === "brands") {
    const per = await Promise.all(plan.brands.map((b) => _dailyTrend(range.from, range.to, b)));
    return per.flat();
  }
  // shops
  if (plan.shops.length === 0) return [];
  const per = await Promise.all(plan.shops.map((id) => _dailyTrend(range.from, range.to, undefined, id)));
  return per.flat();
}

export async function getDailyTrend(
  filter: PosFilter,
): Promise<{ current: DayPoint[]; comparison: DayPoint[] | null; degraded: boolean }> {
  const { resolved, shops } = await scopeContext(filter);
  const to = filter.currency;
  const rates = await getFxRates();
  const plan = dailyPlan(resolved, shops);
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const [curRows, prevRows] = await Promise.all([
    dailyRows(plan, range),
    cmp ? dailyRows(plan, cmp) : Promise.resolve<DailyRevenueRow[]>([]),
  ]);
  return {
    current: foldDaily(convertRows(curRows, to, rates, DAILY_MONEY)),
    comparison: cmp ? foldDaily(convertRows(prevRows, to, rates, DAILY_MONEY)) : null,
    degraded: plan.mode === "degraded",
  };
}

// --- Žebříček PRODEJEN (rollup pokladen -> lokalita) ---

const _shopRev = posQuery(
  (from: string, to: string, brand_id?: string) =>
    collectPaged((page) => api.getRevenueByShop({ date_from: from, date_to: to, brand_id, page, limit: PAGE_SIZE })),
  "shop-rev",
);

interface Sums {
  gross: number;
  net: number;
  vat: number;
  receipts: number;
  units: Set<string>; // pokladny (lokalita) / lokality (koncept)
}
function emptySums(): Sums {
  return { gross: 0, net: 0, vat: 0, receipts: 0, units: new Set() };
}
function addRow(s: Sums, r: ShopRevenueRow, unit: string): void {
  s.gross += r.gross;
  s.net += r.net;
  s.vat += r.vat;
  s.receipts += r.receipts;
  s.units.add(unit);
}

// Klíč prodejny pro pokladnu: locationId, nebo pseudo "shop:{id}" pro nenapárované.
function locationKeyOf(shopId: string, index: PairingIndex): string {
  return index.locationByShop.get(shopId) ?? `shop:${shopId}`;
}
function conceptOfLocationKey(key: string, index: PairingIndex): LocationConcept {
  if (key.startsWith("shop:")) return conceptOfShop(key.slice(5), index);
  return index.conceptByLocation.get(key) ?? "other";
}

export async function getLocationLeaderboardFull(filter: PosFilter): Promise<LocationRevenueRowWithPrev[]> {
  const { resolved, index, shops, locations } = await scopeContext(filter);
  const to = filter.currency;
  const rates = await getFxRates();
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const [cur, prev] = await Promise.all([
    _shopRev(range.from, range.to),
    cmp ? _shopRev(cmp.from, cmp.to) : Promise.resolve<ShopRevenueRow[]>([]),
  ]);
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const shopName = new Map(shops.map((s) => [s.id, s.name]));

  const group = (rows: ShopRevenueRow[]) => {
    const m = new Map<string, Sums>();
    for (const r of rows) {
      if (!resolved.shopIds.has(r.shop_id)) continue;
      const key = locationKeyOf(r.shop_id, index);
      const s = m.get(key) ?? emptySums();
      addRow(s, r, r.shop_id);
      m.set(key, s);
    }
    return m;
  };
  const curG = group(convertRows(cur, to, rates, SHOP_MONEY));
  const prevG = group(convertRows(prev, to, rates, SHOP_MONEY));

  const rows: LocationRevenueRowWithPrev[] = [];
  for (const [key, s] of curG) {
    const p = prevG.get(key);
    const isPseudo = key.startsWith("shop:");
    const name = isPseudo ? shopName.get(key.slice(5)) ?? key : locName.get(key) ?? key;
    rows.push({
      locationId: key,
      name,
      concept: conceptOfLocationKey(key, index),
      currency: to,
      gross: s.gross,
      net: s.net,
      vat: s.vat,
      receipts: s.receipts,
      shopCount: s.units.size,
      prevGross: p?.gross ?? null,
      prevNet: p?.net ?? null,
      prevReceipts: p?.receipts ?? null,
    });
  }
  // Same-store: jen prodejny s tržbou v obou obdobích (srovnatelná báze), aplikováno
  // až PO součtu na prodejnu (ne na pokladně).
  return filter.sameStore ? rows.filter((r) => r.prevGross != null) : rows;
}

// --- Hybatelé dne (Živě): nej/nejhorší prodejny vs stejný den minulý týden "k této hodině" ---
// Per prodejna: dnešek-zatím vs očekávání podle STEJNÉHO DNE MINULÉHO TÝDNE (D-7)
// přepočteného na frakci dne uplynulou do teď. Baseline = stejný den v týdnu, takže
// srovnání není zkresleno odlišným profilem dne (po vs so). f = podíl typické denní
// tržby spadlý do uplynulých hodin (z ~4týdenní hodinové křivky napříč dny - bez
// konvence dne v týdnu). Pořadí moverů je na f nezávislé (f je konstanta), takže
// robustní; f jen určuje nulovou linii "náskok/skluz".
function nowPragueHourFrac(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h + m / 60;
}

export async function getLiveMovers(filter: PosFilter, topN = 5): Promise<LiveMovers> {
  const to = filter.currency;
  const todayRange = resolveDateRange({ ...filter, preset: "dnes" });
  // Baseline = stejný den minulý týden (D-7), ne včerejšek.
  const baseDay = addDays(todayRange.from, -7);
  const baseRange = { from: baseDay, to: baseDay };

  // Data-okna jsou čistě z filtru (nezávisí na scope ani FX), a by-shop/heatmap se
  // filtrují přes resolved.shopIds až po dotažení -> všech pět dotazů může běžet
  // naráz. Ušetří sériové čekání na studené cestě (po syncu DW, než doběhne warm).
  const _t = (label: string, p: Promise<unknown>) => {
    const s = Date.now();
    return Promise.resolve(p).finally(() => console.log(`[PERF] getLiveMovers.${label} ${Date.now() - s}ms`));
  };
  const _tot = Date.now();
  const [{ resolved, index, shops, locations }, rates, todayRows, baseRows, cells] = await Promise.all([
    _t("scope", scopeContext(filter)) as ReturnType<typeof scopeContext>,
    _t("fx", getFxRates()) as ReturnType<typeof getFxRates>,
    _t("shopRevToday", _shopRev(todayRange.from, todayRange.to)) as ReturnType<typeof _shopRev>,
    _t("shopRevD7", _shopRev(baseRange.from, baseRange.to)) as ReturnType<typeof _shopRev>,
    _t("heatmap30d", getHeatmap({ ...filter, preset: "poslednich-30-dni" })) as ReturnType<typeof getHeatmap>,
  ]);
  console.log(`[PERF] getLiveMovers.allParallel ${Date.now() - _tot}ms`);

  // f váženě: každá typická hodina × kolik z ní už uplynulo.
  const nowFrac = nowPragueHourFrac();
  let curveSoFar = 0;
  let curveFull = 0;
  for (const c of cells) {
    curveFull += c.gross;
    curveSoFar += c.gross * Math.min(1, Math.max(0, nowFrac - c.hour));
  }
  const f = curveFull > 0 ? Math.min(1, Math.max(0.0001, curveSoFar / curveFull)) : 1;

  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const shopName = new Map(shops.map((s) => [s.id, s.name]));
  const sumByLoc = (rows: ShopRevenueRow[]) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (!resolved.shopIds.has(r.shop_id)) continue;
      m.set(locationKeyOf(r.shop_id, index), (m.get(locationKeyOf(r.shop_id, index)) ?? 0) + r.gross);
    }
    return m;
  };
  const baseConv = convertRows(baseRows, to, rates, SHOP_MONEY);
  const todayByLoc = sumByLoc(convertRows(todayRows, to, rates, SHOP_MONEY));
  const baseByLoc = sumByLoc(baseConv);

  // Celkový baseline přes scope (stejný den minulý týden, celý den) - báze pro KPI
  // srovnání na Živě. receipts se nepřevádí (počet), gross/net už přepočtené FX.
  let baseGross = 0;
  let baseNet = 0;
  let baseReceipts = 0;
  for (const r of baseConv) {
    if (!resolved.shopIds.has(r.shop_id)) continue;
    baseGross += r.gross;
    baseNet += r.net;
    baseReceipts += r.receipts;
  }

  // Báze = prodejny s tržbou stejný den minulý týden (mají co srovnávat). Dnešek
  // může být 0 (pokles).
  const rows: LiveMoverRow[] = [];
  for (const [key, baseFull] of baseByLoc) {
    if (baseFull <= 0) continue;
    const todaySoFar = todayByLoc.get(key) ?? 0;
    const expectedByNow = baseFull * f;
    const isPseudo = key.startsWith("shop:");
    const name = isPseudo ? shopName.get(key.slice(5)) ?? key : locName.get(key) ?? key;
    rows.push({
      locationId: key,
      name,
      concept: conceptOfLocationKey(key, index),
      currency: to,
      todaySoFar,
      baselineFull: baseFull,
      expectedByNow,
      deltaAbs: todaySoFar - expectedByNow,
      deltaPct: expectedByNow > 0 ? todaySoFar / expectedByNow - 1 : null,
    });
  }
  // Čisté oddělení: nahoře jen prodejny nad tempem (Δ>0), dole jen pod tempem
  // (Δ<0). Přesně-na-tempu (Δ≈0) nepatří ani do jednoho. Žádný překryv.
  rows.sort((a, b) => b.deltaAbs - a.deltaAbs);
  const best = rows.filter((r) => r.deltaAbs > 0).slice(0, topN);
  const worst = rows
    .filter((r) => r.deltaAbs < 0)
    .slice(-topN)
    .reverse();
  return {
    best,
    worst,
    all: rows, // už seřazené deltaAbs DESC (náskok -> pokles)
    baseline: { gross: baseGross, net: baseNet, receipts: baseReceipts },
    dayFraction: f,
    currency: to,
  };
}

// --- Žebříček KONCEPTŮ (rollup pokladen -> lokalita -> koncept) ---

export async function getConceptLeaderboardFull(filter: PosFilter): Promise<ConceptRevenueRowWithPrev[]> {
  const { resolved, index } = await scopeContext(filter);
  const to = filter.currency;
  const rates = await getFxRates();
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const [cur, prev] = await Promise.all([
    _shopRev(range.from, range.to),
    cmp ? _shopRev(cmp.from, cmp.to) : Promise.resolve<ShopRevenueRow[]>([]),
  ]);

  const group = (rows: ShopRevenueRow[]) => {
    const m = new Map<LocationConcept, Sums>();
    for (const r of rows) {
      if (!resolved.shopIds.has(r.shop_id)) continue;
      const key = locationKeyOf(r.shop_id, index);
      const concept = conceptOfLocationKey(key, index);
      const s = m.get(concept) ?? emptySums();
      addRow(s, r, key); // unit = lokalita -> locationCount
      m.set(concept, s);
    }
    return m;
  };
  const curG = group(convertRows(cur, to, rates, SHOP_MONEY));
  const prevG = group(convertRows(prev, to, rates, SHOP_MONEY));

  const rows: ConceptRevenueRowWithPrev[] = [];
  for (const [concept, s] of curG) {
    const p = prevG.get(concept);
    rows.push({
      concept,
      currency: to,
      gross: s.gross,
      net: s.net,
      vat: s.vat,
      receipts: s.receipts,
      locationCount: s.units.size,
      prevGross: p?.gross ?? null,
      prevNet: p?.net ?? null,
      prevReceipts: p?.receipts ?? null,
    });
  }
  return filter.sameStore ? rows.filter((r) => r.prevGross != null) : rows;
}

// --- Žebříček MĚST (rollup pokladen -> město z párování) ---

export async function getCityLeaderboardFull(filter: PosFilter): Promise<CityRevenueRowWithPrev[]> {
  const { resolved, index } = await scopeContext(filter);
  const to = filter.currency;
  const rates = await getFxRates();
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const [cur, prev] = await Promise.all([
    _shopRev(range.from, range.to),
    cmp ? _shopRev(cmp.from, cmp.to) : Promise.resolve<ShopRevenueRow[]>([]),
  ]);

  const group = (rows: ShopRevenueRow[]) => {
    const m = new Map<string, Sums>();
    for (const r of rows) {
      if (!resolved.shopIds.has(r.shop_id)) continue;
      const city = index.cityByShop.get(r.shop_id) || "Neuvedeno";
      const s = m.get(city) ?? emptySums();
      addRow(s, r, locationKeyOf(r.shop_id, index)); // unit = lokalita -> locationCount
      m.set(city, s);
    }
    return m;
  };
  const curG = group(convertRows(cur, to, rates, SHOP_MONEY));
  const prevG = group(convertRows(prev, to, rates, SHOP_MONEY));

  const rows: CityRevenueRowWithPrev[] = [];
  for (const [city, s] of curG) {
    const p = prevG.get(city);
    rows.push({
      city,
      currency: to,
      gross: s.gross,
      net: s.net,
      vat: s.vat,
      receipts: s.receipts,
      locationCount: s.units.size,
      prevGross: p?.gross ?? null,
      prevNet: p?.net ?? null,
      prevReceipts: p?.receipts ?? null,
    });
  }
  return filter.sameStore ? rows.filter((r) => r.prevGross != null) : rows;
}

// Ponecháno pro zpětnou kompatibilitu (žebříček značek nahrazen Koncepty).
const _byBrand = posQuery(
  (from: string, to: string) => api.getRevenueByBrand({ date_from: from, date_to: to }),
  "by-brand",
);
export async function getBrandLeaderboardFull(filter: PosFilter): Promise<BrandRevenueRowWithPrev[]> {
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const to = filter.currency;
  const rates = await getFxRates();
  const [cur, prev] = await Promise.all([
    _byBrand(range.from, range.to),
    cmp ? _byBrand(cmp.from, cmp.to) : Promise.resolve<{ data: BrandRevenueRow[] }>({ data: [] }),
  ]);
  // Více měn -> sečti per brand_id po FX převodu (značka může mít pokladny ve více měnách).
  const fold = (rows: BrandRevenueRow[]) => {
    const m = new Map<string, BrandRevenueRow>();
    for (const r of convertRows(rows, to, rates, BRAND_MONEY)) {
      const e = m.get(r.brand_id);
      if (!e) m.set(r.brand_id, { ...r });
      else {
        e.gross += r.gross;
        e.net += r.net;
        e.vat += r.vat;
        e.receipts += r.receipts;
      }
    }
    return m;
  };
  const prevMap = fold(prev.data);
  const merged: BrandRevenueRowWithPrev[] = [...fold(cur.data).values()].map((r) => {
    const p = prevMap.get(r.brand_id);
    return { ...r, prevGross: p?.gross ?? null, prevNet: p?.net ?? null, prevReceipts: p?.receipts ?? null };
  });
  return filter.sameStore ? merged.filter((r) => r.prevGross != null) : merged;
}

// --- Top/bottom produkty (/v1/products/sales) ---
// DW vrací řádky per (produkt, měna). Po FX převodu sloučíme per product_id,
// přepočteme jednotkové ceny a teprve pak seřadíme a ořežeme na limit. DW tahá
// 2× limit (sort je raw přes měny), ať cizoměnové produkty nevypadnou před sloučením.

const _products = posQuery(
  (from: string, to: string, sort: "gross" | "qty", limit: number, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getProductSales({ date_from: from, date_to: to, sort, limit, brand_id, shop_id, shop_ids }),
  "products",
);

export async function getTopProducts(
  filter: PosFilter,
  sort: "gross" | "qty" = "gross",
  limit = 20,
): Promise<ProductSalesRow[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty) return [];
  const to = filter.currency;
  const rates = await getFxRates();
  const range = aggWindow(filter);
  const want = clampLimit(limit);
  const rows = (await _products(range.from, range.to, sort, clampLimit(limit * 2), sp.brand_id, sp.shop_id, sp.shop_ids)).data;

  const m = new Map<string, ProductSalesRow>();
  for (const r of convertRows(rows, to, rates, PRODUCT_MONEY)) {
    const e = m.get(r.product_id);
    if (!e) m.set(r.product_id, { ...r });
    else {
      e.qty += r.qty;
      e.gross += r.gross;
      e.net += r.net;
      e.vat += r.vat;
    }
  }
  const merged = [...m.values()].map((p) => ({
    ...p,
    avg_unit_price: p.qty > 0 ? p.gross / p.qty : null,
    avg_unit_price_net: p.qty > 0 ? p.net / p.qty : null,
  }));
  merged.sort((a, b) => (sort === "qty" ? b.qty - a.qty : b.gross - a.gross));
  return merged.slice(0, want);
}

// --- Detail produktu (/v1/products/detail): rozpad po prodejnách + denní trend ---
// Scope (brand_id/shop_id/shop_ids) posíláme do DW, takže by_shop i daily sedí na
// výběr. Pokladny pak rolneme na prodejny (jako leaderboard) a přepočteme přes FX.

const _productDetail = posQuery(
  (productId: string, from: string, to: string, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getProductDetail({ product_id: productId, date_from: from, date_to: to, brand_id, shop_id, shop_ids }),
  "product-detail",
);

export async function getProductDetail(productId: string, filter: PosFilter): Promise<ProductDetail> {
  const { resolved, index, shops, locations } = await scopeContext(filter);
  const to = filter.currency;
  const empty: ProductDetail = {
    productId,
    name: null,
    currency: to,
    totalQty: 0,
    totalGross: 0,
    totalNet: 0,
    byLocation: [],
    daily: [],
  };
  const sp = scopeApiParams(resolved);
  if (sp.__empty) return empty;
  const rates = await getFxRates();
  const range = aggWindow(filter);
  const raw = (await _productDetail(productId, range.from, range.to, sp.brand_id, sp.shop_id, sp.shop_ids)).data;
  if (!raw) return empty;

  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const shopName = new Map(shops.map((s) => [s.id, s.name]));

  // by_shop -> FX -> filtr na výběr (pojistka) -> rollup na prodejny
  const byLoc = new Map<string, { qty: number; gross: number; net: number }>();
  for (const r of convertRows(raw.by_shop, to, rates, PRODUCT_SHOP_MONEY)) {
    if (!resolved.shopIds.has(r.shop_id)) continue;
    const key = locationKeyOf(r.shop_id, index);
    const e = byLoc.get(key) ?? { qty: 0, gross: 0, net: 0 };
    e.qty += r.qty;
    e.gross += r.gross;
    e.net += r.net;
    byLoc.set(key, e);
  }
  const byLocation: ProductLocationRow[] = [...byLoc.entries()]
    .map(([key, v]) => {
      const isPseudo = key.startsWith("shop:");
      return {
        locationId: key,
        name: isPseudo ? shopName.get(key.slice(5)) ?? key : locName.get(key) ?? key,
        concept: conceptOfLocationKey(key, index),
        qty: v.qty,
        gross: v.gross,
        net: v.net,
      };
    })
    .sort((a, b) => b.gross - a.gross);

  // daily -> FX -> fold po dnech (endpoint už scopoval dle výběru)
  const byDay = new Map<string, { gross: number; net: number; qty: number }>();
  for (const r of convertRows(raw.daily, to, rates, PRODUCT_DAY_MONEY)) {
    const e = byDay.get(r.date) ?? { gross: 0, net: 0, qty: 0 };
    e.gross += r.gross;
    e.net += r.net;
    e.qty += r.qty;
    byDay.set(r.date, e);
  }
  const daily = [...byDay.entries()]
    .map(([date, v]) => ({ date, gross: v.gross, net: v.net, qty: v.qty }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalQty = byLocation.reduce((s, r) => s + r.qty, 0);
  const totalGross = byLocation.reduce((s, r) => s + r.gross, 0);
  const totalNet = byLocation.reduce((s, r) => s + r.net, 0);

  return { productId, name: raw.name, currency: to, totalQty, totalGross, totalNet, byLocation, daily };
}

// --- Účtenky: list (stránkovaný) + detail (/v1/receipts(+/{id})) ---
// List se tahá přes VŠECHNY měny a každý řádek se přepočte do zvolené měny (ať jsou
// částky srovnatelné a řaditelné). Detail jednotlivé účtenky zůstává v NATIVNÍ měně
// (je to doklad), proto se nepřevádí.

const _receipts = posQuery(
  (from: string, to: string, page: number, limit: number, shop_id?: string, shop_ids?: string, channel?: string) =>
    api.listReceipts({ date_from: from, date_to: to, page, limit, shop_id, shop_ids, channel }),
  "receipts",
);

export async function getReceiptsPage(
  filter: PosFilter,
  page = 0,
  opts: { limit?: number; channel?: string } = {},
): Promise<Paged<ReceiptListItem>> {
  const { resolved, index, locations, shops } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty) return { data: [], meta: { page: 0, limit: opts.limit ?? 50, total: 0 } };
  const to = filter.currency;
  const rates = await getFxRates();
  const range = rawWindow(filter);
  const res = await _receipts(
    range.from,
    range.to,
    clampPage(page),
    clampLimit(opts.limit ?? 50),
    sp.shop_id,
    sp.shop_ids,
    opts.channel,
  );
  // Obohacení o prodejnu + město z párování (indexy už scopeContext načetl, zadarmo).
  // Nenapárovaná pokladna padá zpět na surový shop_name; město na ApiShop.city.
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const shopCity = new Map(shops.map((s) => [s.id, s.city]));
  const data: ReceiptListItem[] = convertRows(res.data, to, rates, RECEIPT_MONEY).map((r) => {
    const locId = index.locationByShop.get(r.shop_id);
    const locationName = (locId ? locName.get(locId) : undefined) ?? r.shop_name;
    const city = index.cityByShop.get(r.shop_id) ?? shopCity.get(r.shop_id) ?? null;
    return { ...r, locationName, city };
  });
  return { data, meta: res.meta };
}

const _receiptDetail = posQuery((id: string) => api.getReceipt(id), "receipt-detail");
export function getReceiptDetail(id: string): Promise<ReceiptDetail> {
  return _receiptDetail(id);
}

// Prodejna + město pro jednu pokladnu (header detailu účtenky). Čte tytéž cachované
// indexy jako seznam, takže deep-link na detail ukáže stejné jako řádek v listu.
export async function getReceiptShopDisplay(
  shopId: string,
): Promise<{ locationName: string | null; city: string | null }> {
  const [index, locations, shops] = await Promise.all([_pairingIndex(), _locations(), getAllShops()]);
  const locId = index.locationByShop.get(shopId);
  const locationName = (locId ? locations.find((l) => l.id === locId)?.name : undefined) ?? null;
  const city = index.cityByShop.get(shopId) ?? shops.find((s) => s.id === shopId)?.city ?? null;
  return { locationName, city };
}

// --- Analytics (heatmapa/daypart jsou raw -> kratší okno) ---

const _heatmap = posQuery(
  (from: string, to: string, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getHeatmap({ date_from: from, date_to: to, brand_id, shop_id, shop_ids }),
  "heatmap",
);
export async function getHeatmap(filter: PosFilter): Promise<HeatmapCell[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty) return [];
  const to = filter.currency;
  const rates = await getFxRates();
  const range = rawWindow(filter);
  const cells = (await _heatmap(range.from, range.to, sp.brand_id, sp.shop_id, sp.shop_ids)).data;
  return convertRows(cells, to, rates, HEATMAP_MONEY);
}

// --- Hodinový trend (denní zobrazení "Dnes") ---
// Z hodinové heatmapy: aktuální okno (dnešek) + srovnávací den (celý), sečteno
// přes dny/scope do bodu na hodinu. nowHour = aktuální hodina v Praze, pro férové
// srovnání "do teď" v KPI.

function nowPragueHour(): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return Number(h) % 24;
}

function foldHourly(cells: HeatmapCell[]): HourPoint[] {
  const byHour = new Map<number, HourPoint>();
  for (const c of cells) {
    const h = byHour.get(c.hour) ?? { hour: c.hour, gross: 0, net: 0, receipts: 0 };
    h.gross += c.gross;
    h.net += c.net;
    h.receipts += c.receipts;
    byHour.set(c.hour, h);
  }
  return [...byHour.values()].sort((a, b) => a.hour - b.hour);
}

export async function getHourlyTrend(
  filter: PosFilter,
): Promise<{ current: HourPoint[]; comparison: HourPoint[] | null; nowHour: number }> {
  const nowHour = nowPragueHour();
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty) return { current: [], comparison: null, nowHour };
  const to = filter.currency;
  const rates = await getFxRates();
  const range = rawWindow(filter);
  const cmp = resolveComparisonRange(filter, resolveDateRange(filter));
  const [cur, prev] = await Promise.all([
    _heatmap(range.from, range.to, sp.brand_id, sp.shop_id, sp.shop_ids),
    cmp
      ? _heatmap(cmp.from, cmp.to, sp.brand_id, sp.shop_id, sp.shop_ids)
      : Promise.resolve<{ data: HeatmapCell[] }>({ data: [] }),
  ]);
  return {
    current: foldHourly(convertRows(cur.data, to, rates, HEATMAP_MONEY)),
    comparison: cmp ? foldHourly(convertRows(prev.data, to, rates, HEATMAP_MONEY)) : null,
    nowHour,
  };
}

const _daypart = posQuery(
  (from: string, to: string, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getDaypart({ date_from: from, date_to: to, brand_id, shop_id, shop_ids }),
  "daypart",
);
export async function getDaypart(filter: PosFilter): Promise<DaypartRow[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty) return [];
  const to = filter.currency;
  const rates = await getFxRates();
  const range = rawWindow(filter);
  const rows = (await _daypart(range.from, range.to, sp.brand_id, sp.shop_id, sp.shop_ids)).data;
  return convertRows(rows, to, rates, DAYPART_MONEY);
}

const _paymentMix = posQuery(
  (from: string, to: string, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getPaymentMix({ date_from: from, date_to: to, brand_id, shop_id, shop_ids }),
  "payment-mix",
);
export async function getPaymentMix(filter: PosFilter): Promise<PaymentMixRow[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty) return [];
  const to = filter.currency;
  const rates = await getFxRates();
  const range = aggWindow(filter);
  const rows = (await _paymentMix(range.from, range.to, sp.brand_id, sp.shop_id, sp.shop_ids)).data;
  return convertRows(rows, to, rates, PAYMIX_MONEY);
}

const _vatSplit = posQuery(
  (from: string, to: string, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getVatSplit({ date_from: from, date_to: to, brand_id, shop_id, shop_ids }),
  "vat-split",
);
export async function getVatSplit(filter: PosFilter): Promise<VatSplitRow[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty) return [];
  const to = filter.currency;
  const rates = await getFxRates();
  const range = aggWindow(filter);
  const rows = (await _vatSplit(range.from, range.to, sp.brand_id, sp.shop_id, sp.shop_ids)).data;
  return convertRows(rows, to, rates, VAT_MONEY);
}

const _today = posQuery(
  (brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getToday({ brand_id, shop_id, shop_ids }),
  "today",
);
export async function getToday(filter: PosFilter): Promise<TodayRow[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty) return [];
  const to = filter.currency;
  const rates = await getFxRates();
  const rows = (await _today(sp.brand_id, sp.shop_id, sp.shop_ids)).data;
  return sumTodayRows(rows, to, rates);
}
