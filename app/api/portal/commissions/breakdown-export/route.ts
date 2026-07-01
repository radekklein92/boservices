import { NextResponse } from "next/server";
import {
  isAdminRole,
  requireSession,
} from "@/lib/portal/auth-guard";
import {
  cachedGetClaimsOverlay,
  cachedListContracts,
} from "@/lib/portal/cached-db";
import {
  buildCommissionsView,
  isSalespersonEmail,
} from "@/lib/portal/commissions";
import { buildXlsx, type XlsxSheet } from "@/lib/portal/xlsx-writer";

export const maxDuration = 30;

function fmtDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// XLSX rozpisu provizí = jednotlivé provizní položky (celé částky před dělením
// 50:50), tak jak je vidět v tabulce "Rozpis provizí". Vidí ho stejní lidé jako
// stránku Provize: admini + oba obchodníci (Toman/Ebermann).
export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const email = g.session.user?.email;
  const role = g.session.user?.role;
  if (!isAdminRole(role) && !isSalespersonEmail(email)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const [contracts, overlay] = await Promise.all([
    cachedListContracts(),
    cachedGetClaimsOverlay(),
  ]);
  const view = buildCommissionsView(contracts, overlay);

  const columns = [
    { header: "Typ", width: 22 },
    { header: "Klient", width: 34 },
    { header: "Číslo smlouvy", width: 14 },
    { header: "Podepsáno", width: 14 },
    { header: "Poznámka", width: 40 },
    { header: "Provize (Kč, před 50:50)", width: 22 },
  ];

  const rows = view.rows.map((r) => [
    r.label,
    r.clientName || "",
    r.number ?? "",
    fmtDate(r.signedAt),
    r.note ?? "",
    Math.round(r.commission),
  ]);

  // Kontrolní součtový řádek dole (jen sloupec Provize).
  const total = view.rows.reduce((s, r) => s + Math.round(r.commission), 0);
  rows.push(["Celkem", "", "", "", "", total]);

  const sheet: XlsxSheet = { name: "Rozpis provizí", columns, rows };

  let buf: Uint8Array;
  try {
    buf = await buildXlsx([sheet]);
  } catch (err) {
    console.error("[commissions] XLSX rozpis export failed", err);
    return NextResponse.json(
      { ok: false, error: "Generování exportu selhalo." },
      { status: 500 },
    );
  }

  const datum = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (ASCII)
  const filename = `provize-rozpis-${datum}.xlsx`;
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
