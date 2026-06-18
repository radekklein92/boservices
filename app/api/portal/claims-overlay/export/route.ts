import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/portal/auth-guard";
import {
  cachedGetClaimsOverlay,
  cachedListContracts,
} from "@/lib/portal/cached-db";
import {
  buildIsirExportData,
  buildIsirExportDocument,
} from "@/lib/portal/isir-export";
import { renderExportPdfBuffer } from "@/lib/portal/pdf-generator";

// Puppeteer cold start může trvat - stejně jako u diff-pdf.
export const maxDuration = 60;

// PDF podklad pro přihlášky pohledávek do insolvence (ISIR), členěný po
// dlužníkovi. Jen admin (obsahuje plný kontext pohledávek).
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const [contracts, overlay] = await Promise.all([
    cachedListContracts(),
    cachedGetClaimsOverlay(),
  ]);
  const data = buildIsirExportData(contracts, overlay);

  if (data.groupsCount === 0) {
    return NextResponse.json(
      { ok: false, error: "Žádné pohledávky k exportu." },
      { status: 400 },
    );
  }

  let pdf: Buffer;
  try {
    const html = buildIsirExportDocument(data, { generatedAt: new Date() });
    pdf = await renderExportPdfBuffer(html, { landscape: true });
  } catch (err) {
    console.error("[claims-overlay] ISIR export PDF failed", err);
    return NextResponse.json(
      { ok: false, error: "Generování PDF selhalo." },
      { status: 500 },
    );
  }

  const datum = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (ASCII)
  const filename = `postoupene-pohledavky-isir-${datum}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Filename": filename,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
