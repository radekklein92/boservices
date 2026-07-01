import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/portal/cron-auth";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { DEFAULT_POS_FILTER, type PosFilter } from "@/lib/portal/pos/filters";
import {
  getAllShops,
  getBrands,
  getClosedStores,
  getConceptLeaderboardFull,
  getDailyTrend,
  getHeatmap,
  getKpiSummary,
  getLiveMovers,
  getLocationLeaderboardFull,
  getLongClosedBosStores,
  getPeriodTotals,
  getReceiptDetail,
  getReceiptsPage,
  getToday,
} from "@/lib/portal/pos/queries";
import { refreshBosDashboardSnapshot } from "@/lib/portal/pos/bos-dashboard-snapshot";

// Musí sedět s LIMIT na /portal/pos/uctenky, jinak warm trefí jiný cache klíč.
const RECEIPTS_LIMIT = 50;
// Předehřát i prvních pár detailů (první obrazovka) -> náhledy produktů naskočí
// hned, ne až po lazy dotažení.
const RECEIPTS_DETAIL_WARM = 8;

// Předehřeje seznam účtenek (strana 0) i detaily první obrazovky pro daný filtr.
async function warmReceipts(filter: PosFilter): Promise<void> {
  const page = await getReceiptsPage(filter, 0, { limit: RECEIPTS_LIMIT });
  await Promise.allSettled(page.data.slice(0, RECEIPTS_DETAIL_WARM).map((r) => getReceiptDetail(r.id)));
}

// Předehřátí POS cache (vercel.json cron). POS dotazy jsou cachované s klíčem
// obsahujícím razítko syncu DW - po každém syncu se klíč změní a první návštěvník
// by jinak zaplatil plnou cenu (~2-3 s). Tento cron běží často (á 5 min), takže
// pro DEFAULT filtr (drtivá většina návštěv Přehledu) trefí běžný uživatel vždy
// teplou cache. Číselníky (značky/pobočky) mají dlouhý TTL, warmují se jen pro
// jistotu na studených instancích.
//
// No-op (2xx), když POS API není nakonfigurováno, ať cron nehlásí chybu.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  if (!isPosApiConfigured()) {
    return NextResponse.json({ ok: true, skipped: "POS API not configured" });
  }

  const f = DEFAULT_POS_FILTER; // okruh "bos" (default pohled na Tržby)
  const fAll: PosFilter = { ...DEFAULT_POS_FILTER, scope: "all" }; // celá síť (toggle)
  const tasks: Record<string, Promise<unknown>> = {
    brands: getBrands(),
    shops: getAllShops(),
    kpi: getKpiSummary(f),
    trend: getDailyTrend(f),
    periods: getPeriodTotals(f),
    prodejny: getLocationLeaderboardFull(f),
    koncepty: getConceptLeaderboardFull(f),
    // Celá síť (toggle vedle výběru): předehřát i whole-network pohled, ať přepnutí
    // z BOS na celou síť není po každém syncu studené. Sdílí _shopRev s BOS větví.
    kpiAll: getKpiSummary(fAll),
    trendAll: getDailyTrend(fAll),
    periodsAll: getPeriodTotals(fAll),
    prodejnyAll: getLocationLeaderboardFull(fAll),
    konceptyAll: getConceptLeaderboardFull(fAll),
    // Dashboard /portal: tržby jen za BOS prodejny (graf týdne + KPI 30 dní).
    // Spočítá (5 DW dotazů) a uloží snapshot do Redis -> dashboard čte jen snapshot
    // (1 GET) a nikdy se nezdrží. Běží á 5 min, takže snapshot je vždy čerstvý.
    bosDashboard: refreshBosDashboardSnapshot(),
    // Účtenky (drahý raw DW dotaz) se dosud nepředehřívaly -> seznam byl po každém
    // syncu studený. Warmíme default ("tento týden") i "dnes" (častý, časově citlivý).
    receipts: warmReceipts(f),
    receiptsDnes: warmReceipts({ ...f, preset: "dnes" }),
    // Živě (/portal/pos/zive): hybatelé dne (getLiveMovers s 30denní heatmapou +
    // by-shop today/D-7) jsou nejdražší dotaz Portálu a dosud se nepředehřívaly ->
    // stránka byla po každém syncu studená. Warmíme přesně to, co default pohled
    // Živě volá: dnešní souhrn, dnešní heatmapu a hybatele (ten dotáhne i 30denní
    // heatmapu a by-shop today/D-7 do cache).
    today: getToday(f),
    heatToday: getHeatmap({ ...f, preset: "dnes" }),
    movers: getLiveMovers(f),
    // Neotevřené prodejny (KPI na Živě + tlačítko na Prodejny). Tahá per-pokladnu
    // denní tržbu za ~týden přes by-shop; _shopRev je SDÍLENÉ napříč scope (filtruje
    // se až po dotažení), takže BOS i celá síť jedou z týchž denních dotazů.
    closedStores: getClosedStores(f),
    closedStoresAll: getClosedStores(fAll),
    // Dlouhodobě neotevřené BOS prodejny (tlačítko v modalu neotevřených). VŽDY okruh
    // BOS -> jediná varianta (nezávislá na scope), stačí default měna.
    longClosedBos: getLongClosedBosStores(f.currency),
  };
  const settled = await Promise.allSettled(Object.values(tasks));
  const keys = Object.keys(tasks);
  const warmed = keys.filter((_, i) => settled[i]!.status === "fulfilled");
  const failed = keys.filter((_, i) => settled[i]!.status === "rejected");

  return NextResponse.json({ ok: failed.length === 0, warmed, failed });
}
