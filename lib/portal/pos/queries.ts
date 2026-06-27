import "server-only";
// Cachovaná read vrstva POS dashboardu nad API klientem (api.ts). Každý dotaz je
// obalený posQuery -> Next data cache zarovnaná na sync DW (viz cache.ts).
// Funkce berou PosFilter, vyřeší okno/srovnání/scope a vrátí typovaná data.
//
// Endpointy, které už v API existují (summary, daily, products/sales, receipts),
// fungují hned. Leaderboardy (by-shop/by-brand) a analytics (heatmap/daypart/
// payment-mix/vat-split/today) jsou tenké wrappery na endpointy doplňované do DW
// - rozsvítí se po jejich nasazení; do té doby vrací PosApiError (UI degraduje).
import * as api from "./api";
import { posQuery, posStaticQuery } from "./cache";
import { clampWindow, clampLimit, clampPage, isTestShop, MAX_RAW_WINDOW_DAYS } from "./guards";
import {
  resolveComparisonRange,
  resolveDateRange,
  type DateRange,
  type PosDatePreset,
  type PosFilter,
} from "./filters";
import type {
  ApiBrand,
  ApiShop,
  BrandRevenueRow,
  BrandRevenueRowWithPrev,
  DailyRevenueRow,
  DaypartRow,
  DayPoint,
  HeatmapCell,
  KpiSummary,
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

// Scope -> API filtry. city scope se neřeší přes API (API nemá city filtr) -
// agreguje se portálově přes párovací crosswalk; zatím se chová jako "vše".
function scopeParams(filter: PosFilter): { brand_id?: string; shop_id?: string } {
  const s = filter.scope;
  if (s.kind === "brand") return { brand_id: s.brandId };
  if (s.kind === "shop") return { shop_id: s.shopId };
  return {};
}

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

// --- KPI souhrn (existující endpoint /v1/revenue/summary) ---
// Bez currency filtru -> vrací všechny měny (segmentace + selektor měn v UI).

const _summary = posQuery(
  (from: string, to: string, brand_id?: string, shop_id?: string) =>
    api.getRevenueSummary({ date_from: from, date_to: to, brand_id, shop_id }),
  "summary",
);

export async function getKpiSummary(filter: PosFilter): Promise<KpiSummary> {
  const { brand_id, shop_id } = scopeParams(filter);
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  // Aktuální i srovnávací okno PARALELNĚ (dřív sekvenčně = 2× round-trip).
  const [cur, prev] = await Promise.all([
    _summary(range.from, range.to, brand_id, shop_id),
    cmp ? _summary(cmp.from, cmp.to, brand_id, shop_id) : Promise.resolve<{ data: SummaryRow[] } | null>(null),
  ]);
  return { current: cur.data, comparison: prev ? prev.data : null };
}

// Souhrn za pevná období (Dnes / Tento týden / Tento měsíc / Tento rok) ve scope
// a měně filtru - pro boční panel na Přehledu. Reusuje cached _summary.
export async function getPeriodTotals(
  filter: PosFilter,
): Promise<{ key: PosDatePreset; label: string; net: number; gross: number; receipts: number }[]> {
  const { brand_id, shop_id } = scopeParams(filter);
  const presets: { key: PosDatePreset; label: string }[] = [
    { key: "dnes", label: "Dnes" },
    { key: "tento-tyden", label: "Tento týden" },
    { key: "tento-mesic", label: "Tento měsíc" },
    { key: "tento-rok", label: "Tento rok" },
  ];
  return Promise.all(
    presets.map(async (p) => {
      const range = resolveDateRange({ ...filter, preset: p.key });
      const data = (await _summary(range.from, range.to, brand_id, shop_id)).data;
      const r = data.find((x) => x.currency === filter.currency);
      return { key: p.key, label: p.label, net: r?.net ?? 0, gross: r?.gross ?? 0, receipts: r?.receipts ?? 0 };
    }),
  );
}

// --- Denní trend (existující /v1/revenue/daily, stránkováno -> sběr všech stran) ---

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

// Sečte denní řádky (brand i shop grain) na jeden bod za den, ve zvolené měně.
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

export async function getDailyTrend(
  filter: PosFilter,
): Promise<{ current: DayPoint[]; comparison: DayPoint[] | null }> {
  const { brand_id, shop_id } = scopeParams(filter);
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  // Aktuální i srovnávací okno PARALELNĚ.
  const [curRows, prevRows] = await Promise.all([
    _dailyTrend(range.from, range.to, filter.currency, brand_id, shop_id),
    cmp ? _dailyTrend(cmp.from, cmp.to, filter.currency, brand_id, shop_id) : Promise.resolve<DailyRevenueRow[]>([]),
  ]);
  return { current: foldDaily(curRows), comparison: cmp ? foldDaily(prevRows) : null };
}

// --- Top/bottom produkty (existující /v1/products/sales) ---

const _products = posQuery(
  (from: string, to: string, currency: string, sort: "gross" | "qty", limit: number, brand_id?: string, shop_id?: string) =>
    api.getProductSales({ date_from: from, date_to: to, currency, sort, limit, brand_id, shop_id }),
  "products",
);

export async function getTopProducts(
  filter: PosFilter,
  sort: "gross" | "qty" = "gross",
  limit = 20,
): Promise<ProductSalesRow[]> {
  const { brand_id, shop_id } = scopeParams(filter);
  const range = aggWindow(filter);
  return (await _products(range.from, range.to, filter.currency, sort, clampLimit(limit), brand_id, shop_id)).data;
}

// --- Účtenky: list (stránkovaný) + detail (existující /v1/receipts(+/{id})) ---

const _receipts = posQuery(
  (from: string, to: string, page: number, limit: number, currency?: string, brand_id?: string, shop_id?: string, channel?: string) =>
    api.listReceipts({ date_from: from, date_to: to, page, limit, currency, brand_id, shop_id, channel }),
  "receipts",
);

export async function getReceiptsPage(
  filter: PosFilter,
  page = 0,
  opts: { limit?: number; channel?: string; allCurrencies?: boolean } = {},
): Promise<Paged<ReceiptListRow>> {
  const { brand_id, shop_id } = scopeParams(filter);
  const range = rawWindow(filter);
  return _receipts(
    range.from,
    range.to,
    clampPage(page),
    clampLimit(opts.limit ?? 50),
    opts.allCurrencies ? undefined : filter.currency,
    brand_id,
    shop_id,
    opts.channel,
  );
}

const _receiptDetail = posQuery((id: string) => api.getReceipt(id), "receipt-detail");
export function getReceiptDetail(id: string): Promise<ReceiptDetail> {
  return _receiptDetail(id);
}

// --- Leaderboardy (NOVÉ endpointy by-shop / by-brand) ---

async function collectByShop(p: {
  date_from: string;
  date_to: string;
  currency: string;
  brand_id?: string;
}): Promise<ShopRevenueRow[]> {
  return collectPaged((page) => api.getRevenueByShop({ ...p, page, limit: PAGE_SIZE }));
}
const _shopRev = posQuery(
  (from: string, to: string, currency: string, brand_id?: string) =>
    collectByShop({ date_from: from, date_to: to, currency, brand_id }),
  "shop-rev",
);

// Všechny pobočky ve scope s metrikami aktuálního i srovnávacího okna (delty).
export async function getShopLeaderboardFull(filter: PosFilter): Promise<ShopRevenueRowWithPrev[]> {
  const { brand_id } = scopeParams(filter);
  const range = aggWindow(filter);
  const cmp = resolveComparisonRange(filter, range);
  const [cur, prev] = await Promise.all([
    _shopRev(range.from, range.to, filter.currency, brand_id),
    cmp ? _shopRev(cmp.from, cmp.to, filter.currency, brand_id) : Promise.resolve<ShopRevenueRow[]>([]),
  ]);
  const prevMap = new Map(prev.map((r) => [r.shop_id, r]));
  const merged = cur.map((r) => {
    const p = prevMap.get(r.shop_id);
    return { ...r, prevGross: p?.gross ?? null, prevNet: p?.net ?? null, prevReceipts: p?.receipts ?? null };
  });
  // Same-store: jen pobočky s tržbou v obou obdobích (srovnatelná báze).
  return filter.sameStore ? merged.filter((r) => r.prevGross != null) : merged;
}

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
    cmp
      ? _byBrand(cmp.from, cmp.to, filter.currency)
      : Promise.resolve<{ data: BrandRevenueRow[] }>({ data: [] }),
  ]);
  const prevMap = new Map(prev.data.map((r) => [r.brand_id, r]));
  const merged = cur.data.map((r) => {
    const p = prevMap.get(r.brand_id);
    return { ...r, prevGross: p?.gross ?? null, prevNet: p?.net ?? null, prevReceipts: p?.receipts ?? null };
  });
  return filter.sameStore ? merged.filter((r) => r.prevGross != null) : merged;
}

// --- Analytics (NOVÉ endpointy; heatmapa/daypart jsou raw -> kratší okno) ---

const _heatmap = posQuery(
  (from: string, to: string, currency: string, brand_id?: string, shop_id?: string) =>
    api.getHeatmap({ date_from: from, date_to: to, currency, brand_id, shop_id }),
  "heatmap",
);
export async function getHeatmap(filter: PosFilter): Promise<HeatmapCell[]> {
  const { brand_id, shop_id } = scopeParams(filter);
  const range = rawWindow(filter);
  return (await _heatmap(range.from, range.to, filter.currency, brand_id, shop_id)).data;
}

const _daypart = posQuery(
  (from: string, to: string, currency: string, brand_id?: string, shop_id?: string) =>
    api.getDaypart({ date_from: from, date_to: to, currency, brand_id, shop_id }),
  "daypart",
);
export async function getDaypart(filter: PosFilter): Promise<DaypartRow[]> {
  const { brand_id, shop_id } = scopeParams(filter);
  const range = rawWindow(filter);
  return (await _daypart(range.from, range.to, filter.currency, brand_id, shop_id)).data;
}

const _paymentMix = posQuery(
  (from: string, to: string, currency: string, brand_id?: string, shop_id?: string) =>
    api.getPaymentMix({ date_from: from, date_to: to, currency, brand_id, shop_id }),
  "payment-mix",
);
export async function getPaymentMix(filter: PosFilter): Promise<PaymentMixRow[]> {
  const { brand_id, shop_id } = scopeParams(filter);
  const range = aggWindow(filter);
  return (await _paymentMix(range.from, range.to, filter.currency, brand_id, shop_id)).data;
}

const _vatSplit = posQuery(
  (from: string, to: string, currency: string, brand_id?: string, shop_id?: string) =>
    api.getVatSplit({ date_from: from, date_to: to, currency, brand_id, shop_id }),
  "vat-split",
);
export async function getVatSplit(filter: PosFilter): Promise<VatSplitRow[]> {
  const { brand_id, shop_id } = scopeParams(filter);
  const range = aggWindow(filter);
  return (await _vatSplit(range.from, range.to, filter.currency, brand_id, shop_id)).data;
}

const _today = posQuery(
  (currency: string, brand_id?: string, shop_id?: string) => api.getToday({ currency, brand_id, shop_id }),
  "today",
);
export async function getToday(filter: PosFilter): Promise<TodayRow[]> {
  const { brand_id, shop_id } = scopeParams(filter);
  return (await _today(filter.currency, brand_id, shop_id)).data;
}
