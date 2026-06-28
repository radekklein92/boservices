import "server-only";
// Tenký HTTP klient na veřejné API DW (api.boservices.cz/v1). Drží Bearer klíč
// (POS_API_KEY - secret, proto server-only), krátký timeout a retry na 429/5xx.
// Cache se NEřeší tady - vrstvu unstable_cache zajišťuje cache.ts; fetch jede
// `no-store`, aby nedocházelo ke dvojímu cachování.
import type {
  ApiBrand,
  ApiShop,
  DailyRevenueRow,
  LastSync,
  Listed,
  Paged,
  ProductSalesRow,
  ProductDetailRaw,
  ReceiptDetail,
  ReceiptListRow,
  SummaryRow,
  HeatmapCell,
  DaypartRow,
  PaymentMixRow,
  VatSplitRow,
  ShopRevenueRow,
  BrandRevenueRow,
  TodayRow,
} from "./types";

const BASE = (process.env.POS_API_BASE ?? "https://api.boservices.cz/v1").replace(/\/$/, "");
// Raw-fact endpointy (today, heatmap/daypart, receipts) přes všechny prodejny
// běžně trvají ~6-8 s; 6 s timeout je předčasně shazoval (Živě/Účtenky). Na timeout
// (abort) NEretryujeme - jen by se čekání ztrojnásobilo. 5xx/429/síť dál retry.
const TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;

export class PosApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PosApiError";
    this.status = status;
  }
}

export function isPosApiConfigured(): boolean {
  return !!process.env.POS_API_KEY;
}

type ParamValue = string | number | boolean | undefined | null;
type Params = Record<string, ParamValue>;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiGet<T>(path: string, params?: Params): Promise<T> {
  const key = process.env.POS_API_KEY;
  if (!key) throw new PosApiError("POS_API_KEY není nakonfigurováno", 0);

  const url = new URL(BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) return (await res.json()) as T;
      // 429 / 5xx jsou přechodné -> retry s backoffem; ostatní 4xx jsou tvrdé.
      if (res.status === 429 || res.status >= 500) {
        lastErr = new PosApiError(`API ${res.status} ${path}`, res.status);
        await sleep(250 * (attempt + 1));
        continue;
      }
      throw new PosApiError(`API ${res.status} ${path}`, res.status);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof PosApiError && err.status !== 429 && err.status < 500) throw err;
      // Timeout (abort) NEretryovat - dotaz je pomalý, opakování jen prodlouží čekání.
      if (err instanceof Error && err.name === "AbortError") {
        throw new PosApiError(`API timeout ${path}`, 0);
      }
      // síťová chyba -> retry s backoffem
      lastErr = err;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new PosApiError(`API selhalo: ${path}`, 0);
}

// --- Typované wrappery na jednotlivé endpointy ---

type RevenueParams = {
  date_from: string;
  date_to: string;
  currency?: string;
  brand_id?: string;
  shop_id?: string;
  // CSV dwShopId pro multi-select (WHERE shop_id = ANY). Doplněno do DW; když
  // chybí, endpoint se chová jako bez filtru. Viz queries.ts scopeApiParams.
  shop_ids?: string;
};
type PageParams = { page?: number; limit?: number };

export const getBrands = () => apiGet<Listed<ApiBrand>>("/brands");

export const listShops = (p: { brand_id?: string } & PageParams = {}) =>
  apiGet<Paged<ApiShop>>("/shops", p);

export const getRevenueSummary = (p: RevenueParams) =>
  apiGet<Listed<SummaryRow>>("/revenue/summary", p);

// bucket=month rolluje denní řadu na měsíční buckety (date_trunc, DW PR #39) -
// pro roční/dlouhý trend (měsíční bary). Bez bucket = per-day jako dřív.
export const getRevenueDaily = (p: RevenueParams & PageParams & { bucket?: "month" }) =>
  apiGet<Paged<DailyRevenueRow>>("/revenue/daily", p);

export const getProductSales = (p: RevenueParams & PageParams & { sort?: "gross" | "qty" }) =>
  apiGet<Paged<ProductSalesRow>>("/products/sales", p);

// Detail jednoho produktu (rozpad po pokladnách + denní trend). Vrací { data }.
export const getProductDetail = (p: { product_id: string } & RevenueParams) =>
  apiGet<{ data: ProductDetailRaw }>("/products/detail", p);

// is_refund=true vrátí jen refundace, false jen prodeje; vynecháno = oboje.
// Drill-down "Refundace" ho potřebuje server-side (refundace jsou ~0,3 % dokladů).
export const listReceipts = (p: RevenueParams & PageParams & { channel?: string; is_refund?: boolean }) =>
  apiGet<Paged<ReceiptListRow>>("/receipts", p);

export const getReceipt = (id: string) => apiGet<ReceiptDetail>(`/receipts/${encodeURIComponent(id)}`);

export const getLastSync = () => apiGet<LastSync>("/meta/last-sync");

// --- Nové endpointy (doplní se do apps/api v DW; kontrakt drží types.ts) ---

export const getHeatmap = (p: RevenueParams) => apiGet<Listed<HeatmapCell>>("/analytics/heatmap", p);
export const getDaypart = (p: RevenueParams) => apiGet<Listed<DaypartRow>>("/analytics/daypart", p);
export const getPaymentMix = (p: RevenueParams) =>
  apiGet<Listed<PaymentMixRow>>("/analytics/payment-mix", p);
export const getVatSplit = (p: RevenueParams) => apiGet<Listed<VatSplitRow>>("/analytics/vat-split", p);
export const getRevenueByShop = (p: RevenueParams & PageParams) =>
  apiGet<Paged<ShopRevenueRow>>("/revenue/by-shop", p);
export const getRevenueByBrand = (p: RevenueParams) =>
  apiGet<Listed<BrandRevenueRow>>("/revenue/by-brand", p);
export const getToday = (
  p: { currency?: string; brand_id?: string; shop_id?: string; shop_ids?: string } = {},
) => apiGet<Listed<TodayRow>>("/analytics/today", p);
