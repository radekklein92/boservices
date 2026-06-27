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
import { posQuery } from "./cache";
import { clampWindow, clampLimit, clampPage, MAX_RAW_WINDOW_DAYS } from "./guards";
import {
  resolveComparisonRange,
  resolveDateRange,
  type DateRange,
  type PosFilter,
} from "./filters";
import type {
  ApiBrand,
  ApiShop,
  BrandRevenueRow,
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

// --- Číselníky (pro filtr/scope) ---

const _brands = posQuery(() => api.getBrands(), "brands");
export async function getBrands(): Promise<ApiBrand[]> {
  return (await _brands()).data;
}

async function collectShops(): Promise<ApiShop[]> {
  const out: ApiShop[] = [];
  for (let page = 0; page <= 20; page++) {
    const res = await api.listShops({ page, limit: 200 });
    out.push(...res.data);
    if (res.data.length === 0 || (page + 1) * 200 >= res.meta.total) break;
  }
  return out;
}
const _allShops = posQuery(() => collectShops(), "all-shops");
// Všechny pobočky (pro párovací UI). Cachované přes posQuery (sync-stamp).
export function getAllShops(): Promise<ApiShop[]> {
  return _allShops();
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
  const current = (await _summary(range.from, range.to, brand_id, shop_id)).data;
  const comparison = cmp ? (await _summary(cmp.from, cmp.to, brand_id, shop_id)).data : null;
  return { current, comparison };
}

// --- Denní trend (existující /v1/revenue/daily, stránkováno -> sběr všech stran) ---

async function collectDaily(p: {
  date_from: string;
  date_to: string;
  currency: string;
  brand_id?: string;
  shop_id?: string;
}): Promise<DailyRevenueRow[]> {
  const out: DailyRevenueRow[] = [];
  for (let page = 0; page <= 20; page++) {
    const res = await api.getRevenueDaily({ ...p, page, limit: 200 });
    out.push(...res.data);
    if (res.data.length === 0 || (page + 1) * 200 >= res.meta.total) break;
  }
  return out;
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
  const current = foldDaily(await _dailyTrend(range.from, range.to, filter.currency, brand_id, shop_id));
  const comparison = cmp
    ? foldDaily(await _dailyTrend(cmp.from, cmp.to, filter.currency, brand_id, shop_id))
    : null;
  return { current, comparison };
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

const _byShop = posQuery(
  (from: string, to: string, currency: string, page: number, limit: number, brand_id?: string) =>
    api.getRevenueByShop({ date_from: from, date_to: to, currency, page, limit, brand_id }),
  "by-shop",
);

export async function getShopLeaderboard(
  filter: PosFilter,
  page = 0,
  limit = 200,
): Promise<Paged<ShopRevenueRow>> {
  const { brand_id } = scopeParams(filter);
  const range = aggWindow(filter);
  return _byShop(range.from, range.to, filter.currency, clampPage(page), clampLimit(limit), brand_id);
}

const _byBrand = posQuery(
  (from: string, to: string, currency: string) =>
    api.getRevenueByBrand({ date_from: from, date_to: to, currency }),
  "by-brand",
);

export async function getBrandLeaderboard(filter: PosFilter): Promise<BrandRevenueRow[]> {
  const range = aggWindow(filter);
  return (await _byBrand(range.from, range.to, filter.currency)).data;
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
