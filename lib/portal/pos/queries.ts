import "server-only";
// Cachovaná read vrstva POS dashboardu nad API klientem (api.ts). Každý dotaz je
// obalený posQuery -> Next data cache zarovnaná na sync DW (viz cache.ts).
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
import {
  clampWindow,
  clampLimit,
  clampPage,
  isTestShop,
  MAX_RAW_WINDOW_DAYS,
  MAX_DAILY_SHOP_FANOUT,
} from "./guards";
import {
  isAllSelection,
  resolveComparisonRange,
  resolveDateRange,
  type DateRange,
  type PosDatePreset,
  type PosFilter,
} from "./filters";
import { buildPairingIndex, type PairingIndex } from "./pairing-db";
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
  KpiSummary,
  LocationRevenueRowWithPrev,
  Paged,
  PaymentMixRow,
  ProductSalesRow,
  ReceiptDetail,
  ReceiptListRow,
  ShopRevenueRow,
  ShopRevenueRowWithPrev,
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
// Pobočky pro UI - bez test/neprodejních (Trdlokafe "Test*/VRP") a bez AED
// (124 účtenek, nakonfigurovaná/test pobočka). Cachované.
export async function getAllShops(): Promise<ApiShop[]> {
  return (await _allShops()).filter((s) => !isTestShop(s.name) && s.currency_code !== "AED");
}

// --- Scope kontext (resolver + indexy), dedup per request přes React cache ---

const _pairingIndex = cache(() => buildPairingIndex());
const _locations = cache(() => cachedListLocations());

interface ScopeContext {
  shops: ApiShop[];
  locations: MirroredLocation[];
  index: PairingIndex;
  resolved: ResolvedSelection;
}

async function scopeContext(filter: PosFilter): Promise<ScopeContext> {
  const [shops, index, locations] = await Promise.all([getAllShops(), _pairingIndex(), _locations()]);
  const resolved = resolveSelection(filter.selection, index, shops);
  return { shops, index, locations, resolved };
}

// shop_ids v DW je za přepínačem: než se nasadí rozšířené API, NEposíláme shop_ids
// (DW by je ignorovalo a vrátilo data celé sítě = špatně) -> raději degradace.
const DW_SHOP_IDS = process.env.POS_DW_SHOP_IDS === "1";

// Parametry pro single-endpointy (produkty/účtenky/analytics), které umí jen jeden
// brand_id/shop_id. Mapování výběru:
//   vše               -> {} (bez filtru, přesné)
//   1 pokladna        -> shop_id (přesné)
//   1 celá značka     -> brand_id (přesné i bez DW shop_ids)
//   víc pokladen      -> shop_ids (jen když DW umí), jinak __degraded
//   prázdný výběr     -> __empty
function scopeApiParams(
  resolved: ResolvedSelection,
): { brand_id?: string; shop_id?: string; shop_ids?: string; __empty?: boolean; __degraded?: boolean } {
  if (resolved.isAll) return {};
  const ids = [...resolved.shopIds];
  if (ids.length === 0) return { __empty: true };
  if (ids.length === 1) return { shop_id: ids[0] };
  if (resolved.brandsPresent.length === 1 && resolved.coversWholeBrands.includes(resolved.brandsPresent[0])) {
    return { brand_id: resolved.brandsPresent[0] };
  }
  if (DW_SHOP_IDS) return { shop_ids: ids.join(",") };
  return { __degraded: true };
}

// --- KPI souhrn ---
// "Vše" jede přes /revenue/summary (přesné, vč. refund_rate, všechny měny).
// Výběr se ROLLUPuje z /revenue/by-shop (přesné gross/net/vat/receipts; refund_rate
// jen pokud DW vrací `refunds` per pokladna, jinak null = degradace).

const _summary = posQuery(
  (from: string, to: string, brand_id?: string, shop_id?: string) =>
    api.getRevenueSummary({ date_from: from, date_to: to, brand_id, shop_id }),
  "summary",
);

// Sečte by-shop řádky vybraných pokladen do jednoho SummaryRow (jedna měna).
function rollupSummary(rows: ShopRevenueRow[], shopIds: Set<string>, currency: string): SummaryRow {
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
    refund_rate: hasRefunds && gross + refunds > 0 ? refunds / (gross + refunds) : null,
  };
}

export async function getKpiSummary(filter: PosFilter): Promise<KpiSummary> {
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);

  if (isAllSelection(filter.selection)) {
    const [cur, prev] = await Promise.all([
      _summary(range.from, range.to),
      cmp ? _summary(cmp.from, cmp.to) : Promise.resolve<{ data: SummaryRow[] } | null>(null),
    ]);
    return { current: cur.data, comparison: prev ? prev.data : null };
  }

  const { resolved } = await scopeContext(filter);
  if (resolved.shopIds.size === 0) return { current: [], comparison: cmp ? [] : null };
  const [cur, prev] = await Promise.all([
    _shopRev(range.from, range.to, filter.currency),
    cmp ? _shopRev(cmp.from, cmp.to, filter.currency) : Promise.resolve<ShopRevenueRow[]>([]),
  ]);
  return {
    current: [rollupSummary(cur, resolved.shopIds, filter.currency)],
    comparison: cmp ? [rollupSummary(prev, resolved.shopIds, filter.currency)] : null,
  };
}

// Souhrn za pevná období (Dnes / Tento týden / Tento měsíc / Tento rok) ve scope
// a měně filtru - pro boční panel na Přehledu.
const PERIOD_PRESETS: { key: PosDatePreset; label: string }[] = [
  { key: "dnes", label: "Dnes" },
  { key: "tento-tyden", label: "Tento týden" },
  { key: "tento-mesic", label: "Tento měsíc" },
  { key: "tento-rok", label: "Tento rok" },
];

export async function getPeriodTotals(
  filter: PosFilter,
): Promise<{ key: PosDatePreset; label: string; net: number; gross: number; receipts: number }[]> {
  if (isAllSelection(filter.selection)) {
    return Promise.all(
      PERIOD_PRESETS.map(async (p) => {
        const range = resolveDateRange({ ...filter, preset: p.key });
        const data = (await _summary(range.from, range.to)).data;
        const r = data.find((x) => x.currency === filter.currency);
        return { key: p.key, label: p.label, net: r?.net ?? 0, gross: r?.gross ?? 0, receipts: r?.receipts ?? 0 };
      }),
    );
  }

  const { resolved } = await scopeContext(filter);
  return Promise.all(
    PERIOD_PRESETS.map(async (p) => {
      const range = resolveDateRange({ ...filter, preset: p.key });
      const rows = await _shopRev(range.from, range.to, filter.currency);
      const s = rollupSummary(rows, resolved.shopIds, filter.currency);
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
  currency: string;
  brand_id?: string;
  shop_id?: string;
}): Promise<DailyRevenueRow[]> {
  return collectPaged((page) => api.getRevenueDaily({ ...p, page, limit: PAGE_SIZE }));
}

const _dailyTrend = posQuery(
  (from: string, to: string, currency: string, brand_id?: string, shop_id?: string) =>
    collectDaily({ date_from: from, date_to: to, currency, brand_id, shop_id }),
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

async function dailyRows(plan: DailyPlan, range: DateRange, currency: string): Promise<DailyRevenueRow[]> {
  if (plan.mode === "all") return _dailyTrend(range.from, range.to, currency);
  if (plan.mode === "degraded") return [];
  if (plan.mode === "brands") {
    const per = await Promise.all(plan.brands.map((b) => _dailyTrend(range.from, range.to, currency, b)));
    return per.flat();
  }
  // shops
  if (plan.shops.length === 0) return [];
  const per = await Promise.all(plan.shops.map((id) => _dailyTrend(range.from, range.to, currency, undefined, id)));
  return per.flat();
}

export async function getDailyTrend(
  filter: PosFilter,
): Promise<{ current: DayPoint[]; comparison: DayPoint[] | null; degraded: boolean }> {
  const { resolved, shops } = await scopeContext(filter);
  const plan = dailyPlan(resolved, shops);
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const [curRows, prevRows] = await Promise.all([
    dailyRows(plan, range, filter.currency),
    cmp ? dailyRows(plan, cmp, filter.currency) : Promise.resolve<DailyRevenueRow[]>([]),
  ]);
  return {
    current: foldDaily(curRows),
    comparison: cmp ? foldDaily(prevRows) : null,
    degraded: plan.mode === "degraded",
  };
}

// --- Žebříček PRODEJEN (rollup pokladen -> lokalita) ---

const _shopRev = posQuery(
  (from: string, to: string, currency: string, brand_id?: string) =>
    collectPaged((page) => api.getRevenueByShop({ date_from: from, date_to: to, currency, brand_id, page, limit: PAGE_SIZE })),
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
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const [cur, prev] = await Promise.all([
    _shopRev(range.from, range.to, filter.currency),
    cmp ? _shopRev(cmp.from, cmp.to, filter.currency) : Promise.resolve<ShopRevenueRow[]>([]),
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
  const curG = group(cur);
  const prevG = group(prev);

  const rows: LocationRevenueRowWithPrev[] = [];
  for (const [key, s] of curG) {
    const p = prevG.get(key);
    const isPseudo = key.startsWith("shop:");
    const name = isPseudo ? shopName.get(key.slice(5)) ?? key : locName.get(key) ?? key;
    rows.push({
      locationId: key,
      name,
      concept: conceptOfLocationKey(key, index),
      currency: filter.currency,
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

// --- Žebříček KONCEPTŮ (rollup pokladen -> lokalita -> koncept) ---

export async function getConceptLeaderboardFull(filter: PosFilter): Promise<ConceptRevenueRowWithPrev[]> {
  const { resolved, index } = await scopeContext(filter);
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const [cur, prev] = await Promise.all([
    _shopRev(range.from, range.to, filter.currency),
    cmp ? _shopRev(cmp.from, cmp.to, filter.currency) : Promise.resolve<ShopRevenueRow[]>([]),
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
  const curG = group(cur);
  const prevG = group(prev);

  const rows: ConceptRevenueRowWithPrev[] = [];
  for (const [concept, s] of curG) {
    const p = prevG.get(concept);
    rows.push({
      concept,
      currency: filter.currency,
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
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const [cur, prev] = await Promise.all([
    _shopRev(range.from, range.to, filter.currency),
    cmp ? _shopRev(cmp.from, cmp.to, filter.currency) : Promise.resolve<ShopRevenueRow[]>([]),
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
  const curG = group(cur);
  const prevG = group(prev);

  const rows: CityRevenueRowWithPrev[] = [];
  for (const [city, s] of curG) {
    const p = prevG.get(city);
    rows.push({
      city,
      currency: filter.currency,
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
  (from: string, to: string, currency: string) =>
    api.getRevenueByBrand({ date_from: from, date_to: to, currency }),
  "by-brand",
);
export async function getBrandLeaderboardFull(filter: PosFilter): Promise<BrandRevenueRowWithPrev[]> {
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const [cur, prev] = await Promise.all([
    _byBrand(range.from, range.to, filter.currency),
    cmp ? _byBrand(cmp.from, cmp.to, filter.currency) : Promise.resolve<{ data: BrandRevenueRow[] }>({ data: [] }),
  ]);
  const prevMap = new Map(prev.data.map((r) => [r.brand_id, r]));
  const merged = cur.data.map((r) => {
    const p = prevMap.get(r.brand_id);
    return { ...r, prevGross: p?.gross ?? null, prevNet: p?.net ?? null, prevReceipts: p?.receipts ?? null };
  });
  return filter.sameStore ? merged.filter((r) => r.prevGross != null) : merged;
}

// --- Top/bottom produkty (/v1/products/sales) ---

const _products = posQuery(
  (from: string, to: string, currency: string, sort: "gross" | "qty", limit: number, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getProductSales({ date_from: from, date_to: to, currency, sort, limit, brand_id, shop_id, shop_ids }),
  "products",
);

export async function getTopProducts(
  filter: PosFilter,
  sort: "gross" | "qty" = "gross",
  limit = 20,
): Promise<ProductSalesRow[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty || sp.__degraded) return [];
  const range = aggWindow(filter);
  return (await _products(range.from, range.to, filter.currency, sort, clampLimit(limit), sp.brand_id, sp.shop_id, sp.shop_ids)).data;
}

// --- Účtenky: list (stránkovaný) + detail (/v1/receipts(+/{id})) ---

const _receipts = posQuery(
  (from: string, to: string, page: number, limit: number, currency?: string, shop_id?: string, shop_ids?: string, channel?: string) =>
    api.listReceipts({ date_from: from, date_to: to, page, limit, currency, shop_id, shop_ids, channel }),
  "receipts",
);

export async function getReceiptsPage(
  filter: PosFilter,
  page = 0,
  opts: { limit?: number; channel?: string; allCurrencies?: boolean } = {},
): Promise<Paged<ReceiptListRow>> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty || sp.__degraded) return { data: [], meta: { page: 0, limit: opts.limit ?? 50, total: 0 } };
  const range = rawWindow(filter);
  return _receipts(
    range.from,
    range.to,
    clampPage(page),
    clampLimit(opts.limit ?? 50),
    opts.allCurrencies ? undefined : filter.currency,
    sp.shop_id,
    sp.shop_ids,
    opts.channel,
  );
}

const _receiptDetail = posQuery((id: string) => api.getReceipt(id), "receipt-detail");
export function getReceiptDetail(id: string): Promise<ReceiptDetail> {
  return _receiptDetail(id);
}

// --- Analytics (heatmapa/daypart jsou raw -> kratší okno) ---

const _heatmap = posQuery(
  (from: string, to: string, currency: string, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getHeatmap({ date_from: from, date_to: to, currency, brand_id, shop_id, shop_ids }),
  "heatmap",
);
export async function getHeatmap(filter: PosFilter): Promise<HeatmapCell[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty || sp.__degraded) return [];
  const range = rawWindow(filter);
  return (await _heatmap(range.from, range.to, filter.currency, sp.brand_id, sp.shop_id, sp.shop_ids)).data;
}

const _daypart = posQuery(
  (from: string, to: string, currency: string, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getDaypart({ date_from: from, date_to: to, currency, brand_id, shop_id, shop_ids }),
  "daypart",
);
export async function getDaypart(filter: PosFilter): Promise<DaypartRow[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty || sp.__degraded) return [];
  const range = rawWindow(filter);
  return (await _daypart(range.from, range.to, filter.currency, sp.brand_id, sp.shop_id, sp.shop_ids)).data;
}

const _paymentMix = posQuery(
  (from: string, to: string, currency: string, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getPaymentMix({ date_from: from, date_to: to, currency, brand_id, shop_id, shop_ids }),
  "payment-mix",
);
export async function getPaymentMix(filter: PosFilter): Promise<PaymentMixRow[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty || sp.__degraded) return [];
  const range = aggWindow(filter);
  return (await _paymentMix(range.from, range.to, filter.currency, sp.brand_id, sp.shop_id, sp.shop_ids)).data;
}

const _vatSplit = posQuery(
  (from: string, to: string, currency: string, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getVatSplit({ date_from: from, date_to: to, currency, brand_id, shop_id, shop_ids }),
  "vat-split",
);
export async function getVatSplit(filter: PosFilter): Promise<VatSplitRow[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty || sp.__degraded) return [];
  const range = aggWindow(filter);
  return (await _vatSplit(range.from, range.to, filter.currency, sp.brand_id, sp.shop_id, sp.shop_ids)).data;
}

const _today = posQuery(
  (currency: string, brand_id?: string, shop_id?: string, shop_ids?: string) =>
    api.getToday({ currency, brand_id, shop_id, shop_ids }),
  "today",
);
export async function getToday(filter: PosFilter): Promise<TodayRow[]> {
  const { resolved } = await scopeContext(filter);
  const sp = scopeApiParams(resolved);
  if (sp.__empty || sp.__degraded) return [];
  return (await _today(filter.currency, sp.brand_id, sp.shop_id, sp.shop_ids)).data;
}
