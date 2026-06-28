// Typy odpovědí veřejného API DW (api.boservices.cz/v1). Zrcadlí OpenAPI kontrakt
// (api_v1 views) - portál se váže na TENTO kontrakt, ne na fyzické schéma DW.
// Peníze jsou v nativních jednotkách měny, gross = vč. DPH, net = gross - vat.
// Každý řádek nese vlastní currency; do zobrazovací měny je přepočítá až portál
// (lib/portal/pos/fx.ts, ČNB kurz) v datové vrstvě před agregací.

import type { LocationConcept } from "@/lib/portal/locations-db";

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export type Paged<T> = { data: T[]; meta: PageMeta };
export type Listed<T> = { data: T[] };

export interface ApiBrand {
  id: string;
  code: string;
  name: string;
  default_currency: string;
}

export interface ApiShop {
  id: string;
  brand_id: string;
  name: string;
  code: string | null;
  cloud_id: string | null; // číslo cloudu z Dotykačky (např. "361571594"); null u Trdlokafe
  city: string | null; // populováno jen u Trdlokafe; jinak null -> město bereme z párování
  country: string | null;
  timezone: string;
  currency_code: string;
  is_active: boolean;
  opened_on: string | null; // YYYY-MM-DD; často null -> like-for-like degraduje
  closed_on: string | null;
}

export interface SummaryRow {
  currency: string;
  gross: number;
  net: number;
  vat: number;
  receipts: number;
  avg_ticket: number | null; // gross / receipts; null když receipts = 0
  refund_rate: number | null; // refunds_gross / (gross + refunds_gross)
}

// /v1/revenue/daily vrací union diskriminovaný `grain`. shop_id je jen u grain "shop"
// (tj. když se posílá shop_id v dotazu). Bez shop_id je grain "brand".
export interface DailyRevenueRow {
  grain: "brand" | "shop";
  date: string; // YYYY-MM-DD, shop-local
  brand_id: string;
  shop_id?: string;
  currency: string;
  gross: number;
  net: number;
  vat: number;
  receipts: number;
}

export interface ProductSalesRow {
  product_id: string;
  name: string;
  currency: string;
  qty: number; // může být desetinné (prodej na váhu)
  gross: number;
  net: number;
  vat: number;
  avg_unit_price: number | null;
  avg_unit_price_net: number | null;
  // POZN: API zatím NEvrací kategorii produktu (dim_product.category je navíc jen
  // u Trdlokafe). Kategorizaci buď doplníme do api_v1 view, nebo degradujeme.
}

export interface ReceiptListRow {
  id: string;
  brand_id: string;
  shop_id: string;
  shop_name: string;
  source: "trdlokafe" | "dotykacka";
  source_receipt_id: string;
  opened_at: string; // "YYYY-MM-DD HH:mm:ss" shop-local (naivní) - NEparsovat přes Date jako UTC
  opened_at_utc: string;
  currency: string;
  gross: number;
  net: number;
  vat: number;
  channel: string | null; // např. "cash_desk" (Trdlokafe); u Dotykačky null
  is_refund: boolean;
  original_receipt_id: string | null;
  items_count: number;
  employee_source_id: string | null;
  note: string | null;
}

export interface ReceiptItem {
  id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price_gross: number;
  line_total_gross: number;
  net: number;
  vat: number;
  vat_rate: number | null; // např. 21.000 / 12.000
  line_no: number | null;
  currency: string;
}

export interface ReceiptPayment {
  id: string;
  payment_method: string; // kód metody
  payment_method_name?: string;
  amount: number;
  currency: string;
}

export interface ReceiptDetail extends ReceiptListRow {
  items: ReceiptItem[];
  payments: ReceiptPayment[];
}

// Řádek seznamu účtenek OBOHACENÝ portálem o prodejnu a město (z párovacího
// indexu podle shop_id). API vrací jen surový název pokladny (shop_name) - tohle
// je to, co se reálně zobrazuje v seznamu. locationName padá zpět na shop_name
// u nenapárovaných pokladen; city je null, když párování město nezná.
export interface ReceiptListItem extends ReceiptListRow {
  locationName: string; // prodejna (z párování); fallback = shop_name
  city: string | null; // město z párování (fallback ApiShop.city); null = neznámé
}

export interface LastSync {
  last_successful_run_at: string;
  next_expected_at: string;
}

// --- Odvozené výsledkové typy (počítá portál nad API odpověďmi) ---

// Bod denního trendu (sečteno přes scope, jedna měna).
export interface DayPoint {
  date: string; // YYYY-MM-DD
  gross: number;
  net: number;
  receipts: number;
}

// Bod hodinového trendu (pro denní zobrazení "Dnes") - sečteno přes scope/dny.
export interface HourPoint {
  hour: number; // 0-23 (shop-local)
  gross: number;
  net: number;
  receipts: number;
}

// KPI souhrn pro aktuální okno + (volitelné) srovnávací okno. Per měna.
export interface KpiSummary {
  current: SummaryRow[];
  comparison: SummaryRow[] | null;
}

// Leaderboard řádky s hodnotami srovnávacího okna (pro delty). prev* = null,
// když srovnání není zapnuté nebo pobočka/značka v něm neměla data.
export interface ShopRevenueRowWithPrev extends ShopRevenueRow {
  prevGross: number | null;
  prevNet: number | null;
  prevReceipts: number | null;
}

export interface BrandRevenueRowWithPrev extends BrandRevenueRow {
  prevGross: number | null;
  prevNet: number | null;
  prevReceipts: number | null;
}

// Rollup pokladen (dim_shop) na PRODEJNU (portálová lokalita). locationId je buď
// reálné MirroredLocation.id, nebo pseudo "shop:{dwShopId}" pro nenapárovanou
// pokladnu (aby se neztratily tržby). Počítá portál v queries.ts.
export interface LocationRevenueRow {
  locationId: string;
  name: string;
  concept: LocationConcept;
  currency: string;
  gross: number;
  net: number;
  vat: number;
  receipts: number;
  shopCount: number; // počet pokladen v prodejně (ve výběru)
}

export interface LocationRevenueRowWithPrev extends LocationRevenueRow {
  prevGross: number | null;
  prevNet: number | null;
  prevReceipts: number | null;
}

// Rollup na KONCEPT (skupina prodejen). Nahrazuje žebříček značek.
export interface ConceptRevenueRow {
  concept: LocationConcept;
  currency: string;
  gross: number;
  net: number;
  vat: number;
  receipts: number;
  locationCount: number; // počet prodejen konceptu (ve výběru)
}

export interface ConceptRevenueRowWithPrev extends ConceptRevenueRow {
  prevGross: number | null;
  prevNet: number | null;
  prevReceipts: number | null;
}

// Rollup na MĚSTO (z párování pokladen). "Neuvedeno" = pokladna bez napárovaného města.
export interface CityRevenueRowWithPrev {
  city: string;
  currency: string;
  gross: number;
  net: number;
  vat: number;
  receipts: number;
  locationCount: number;
  prevGross: number | null;
  prevNet: number | null;
  prevReceipts: number | null;
}

// --- Kontrakt nových endpointů doplněných do DW (apps/api). Portál a DW je sdílejí. ---

// /v1/analytics/heatmap - hodina (0-23) x den v týdnu (0=Ne..6=So), shop-local.
export interface HeatmapCell {
  dow: number;
  hour: number;
  currency: string;
  gross: number;
  net: number;
  receipts: number;
}

// /v1/analytics/daypart - rozpad podle denní doby.
export type Daypart = "rano" | "dopoledne" | "poledne" | "odpoledne" | "vecer" | "noc";
export interface DaypartRow {
  daypart: Daypart;
  currency: string;
  gross: number;
  net: number;
  receipts: number;
}

// /v1/analytics/payment-mix - objem plateb dle metody (NE tržby; split platby).
export interface PaymentMixRow {
  payment_method: string;
  payment_method_name: string;
  currency: string;
  payments: number;
  total: number;
}

// /v1/analytics/vat-split - rozpad podle sazby DPH (12 vs 21 ...).
export interface VatSplitRow {
  vat_rate: number | null;
  currency: string;
  gross: number;
  net: number;
  vat: number;
}

// /v1/revenue/by-shop a /v1/revenue/by-brand - window agregace (leaderboard jedním voláním).
export interface ShopRevenueRow {
  shop_id: string;
  brand_id: string;
  currency: string;
  gross: number;
  net: number;
  vat: number;
  receipts: number;
  refunds?: number; // částka vrácená v období; doplněno do DW -> rozsvítí KPI Refundace pro výběr
}

export interface BrandRevenueRow {
  brand_id: string;
  currency: string;
  gross: number;
  net: number;
  vat: number;
  receipts: number;
}

// /v1/analytics/today - dnešní průběžný souhrn (raw fakta, čerstvé) per měna/scope.
export interface TodayRow {
  currency: string;
  gross: number;
  net: number;
  receipts: number;
  as_of: string; // čas posledního zahrnutého dokladu / čas dotazu
}
