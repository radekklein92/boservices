import { NextResponse } from "next/server";
import { requirePOS } from "@/lib/portal/auth-guard";
import { posFilterFromSearchParams } from "@/lib/portal/pos/filters";
import { getReceiptsPage, getTopProducts } from "@/lib/portal/pos/queries";
import { buildXlsx, type XlsxSheet } from "@/lib/portal/xlsx-writer";

export const dynamic = "force-dynamic";

// XLSX export aktuálního filtru. type=produkty|uctenky. Čte stávající endpointy
// (leaderboard/analytics export přibude po nasazení DW endpointů).
export async function GET(req: Request) {
  const g = await requirePOS();
  if (!g.ok) return g.response;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "uctenky" ? "uctenky" : "produkty";
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    sp[k] = v;
  });
  const filter = posFilterFromSearchParams(sp);

  let sheet: XlsxSheet;
  try {
    if (type === "uctenky") {
      const rows: Awaited<ReturnType<typeof getReceiptsPage>>["data"] = [];
      for (let page = 0; page < 10; page++) {
        const res = await getReceiptsPage(filter, page, { limit: 200 });
        rows.push(...res.data);
        if (res.data.length === 0 || (page + 1) * 200 >= res.meta.total) break;
      }
      sheet = {
        name: "Účtenky",
        columns: [
          { header: "Čas", width: 18 },
          { header: "Provozovna", width: 28 },
          { header: "Měna", width: 8 },
          { header: "S DPH", width: 12 },
          { header: "Bez DPH", width: 12 },
          { header: "DPH", width: 10 },
          { header: "Kanál", width: 14 },
          { header: "Refundace", width: 10 },
        ],
        rows: rows.map((r) => [r.opened_at, r.shop_name, r.currency, r.gross, r.net, r.vat, r.channel ?? "", r.is_refund ? "ano" : ""]),
      };
    } else {
      const rows = await getTopProducts(filter, "gross", 500);
      sheet = {
        name: "Produkty",
        columns: [
          { header: "Produkt", width: 36 },
          { header: "Měna", width: 8 },
          { header: "Množství", width: 12 },
          { header: "Tržby s DPH", width: 14 },
          { header: "Tržby bez DPH", width: 14 },
          { header: "DPH", width: 12 },
          { header: "Ø cena", width: 12 },
        ],
        rows: rows.map((p) => [p.name, p.currency, p.qty, p.gross, p.net, p.vat, p.avg_unit_price ?? null]),
      };
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Export se nezdařil" }, { status: 502 });
  }

  const buf = await buildXlsx([sheet]);
  const filename = `pokladna-${type}-${filter.preset}.xlsx`;
  return new NextResponse(new Blob([buf as BlobPart]), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
