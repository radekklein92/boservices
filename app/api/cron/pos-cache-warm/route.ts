import { NextResponse } from "next/server";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { DEFAULT_POS_FILTER, type PosFilter } from "@/lib/portal/pos/filters";
import {
  getAllShops,
  getBrands,
  getConceptLeaderboardFull,
  getDailyTrend,
  getKpiSummary,
  getLocationLeaderboardFull,
  getPeriodTotals,
  getReceiptDetail,
  getReceiptsPage,
} from "@/lib/portal/pos/queries";

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
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isPosApiConfigured()) {
    return NextResponse.json({ ok: true, skipped: "POS API not configured" });
  }

  const f = DEFAULT_POS_FILTER;
  const tasks: Record<string, Promise<unknown>> = {
    brands: getBrands(),
    shops: getAllShops(),
    kpi: getKpiSummary(f),
    trend: getDailyTrend(f),
    periods: getPeriodTotals(f),
    prodejny: getLocationLeaderboardFull(f),
    koncepty: getConceptLeaderboardFull(f),
    // Účtenky (drahý raw DW dotaz) se dosud nepředehřívaly -> seznam byl po každém
    // syncu studený. Warmíme default ("tento týden") i "dnes" (častý, časově citlivý).
    receipts: warmReceipts(f),
    receiptsDnes: warmReceipts({ ...f, preset: "dnes" }),
  };
  const settled = await Promise.allSettled(Object.values(tasks));
  const keys = Object.keys(tasks);
  const warmed = keys.filter((_, i) => settled[i]!.status === "fulfilled");
  const failed = keys.filter((_, i) => settled[i]!.status === "rejected");

  return NextResponse.json({ ok: failed.length === 0, warmed, failed });
}
