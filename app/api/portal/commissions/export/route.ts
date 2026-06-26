import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/portal/auth-guard";
import {
  cachedGetClaimsOverlay,
  cachedListContracts,
} from "@/lib/portal/cached-db";
import { buildCommissionsView } from "@/lib/portal/commissions";
import {
  listPayouts,
  PAYOUT_STATUS_LABEL,
  type PayoutStatus,
} from "@/lib/portal/payouts-db";
import {
  buildCommissionsExportSheets,
  filterPayouts,
  type ExportFilter,
} from "@/lib/portal/commissions-export";
import { buildXlsx } from "@/lib/portal/xlsx-writer";

export const maxDuration = 30;

const ALL_STATUSES = Object.keys(PAYOUT_STATUS_LABEL) as PayoutStatus[];

function parseStatuses(raw: string | null): PayoutStatus[] | undefined {
  if (!raw) return undefined;
  const wanted = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  const valid = ALL_STATUSES.filter((s) => wanted.has(s));
  return valid.length ? valid : undefined;
}

function parseDay(raw: string | null): string | undefined {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

// XLSX podklad pro účetní: list "Payouty" (doklady dle filtru) + "Souhrn
// provizí" (celkový nárok per obchodník). Jen admin - obsahuje data obou
// obchodníků (jako ISIR export).
export async function GET(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const url = new URL(req.url);
  const filter: ExportFilter = {
    statuses: parseStatuses(url.searchParams.get("statuses")),
    from: parseDay(url.searchParams.get("from")),
    to: parseDay(url.searchParams.get("to")),
  };

  const [allPayouts, contracts, overlay] = await Promise.all([
    listPayouts(),
    cachedListContracts(),
    cachedGetClaimsOverlay(),
  ]);
  const view = buildCommissionsView(contracts, overlay);
  const filtered = filterPayouts(allPayouts, filter);
  const sheets = buildCommissionsExportSheets(filtered, view, allPayouts);

  let buf: Uint8Array;
  try {
    buf = await buildXlsx(sheets);
  } catch (err) {
    console.error("[commissions] XLSX export failed", err);
    return NextResponse.json(
      { ok: false, error: "Generování exportu selhalo." },
      { status: 500 },
    );
  }

  const datum = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (ASCII)
  const filename = `provize-uctarna-${datum}.xlsx`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Filename": filename,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
