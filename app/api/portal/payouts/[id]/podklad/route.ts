import { NextResponse } from "next/server";
import { isAdminRole, requireSession } from "@/lib/portal/auth-guard";
import { salespersonByEmail } from "@/lib/portal/commissions";
import { getPayout } from "@/lib/portal/payouts-db";
import { renderPayoutPodkladPdf } from "@/lib/portal/payout-pdf";

// Puppeteer cold start může trvat.
export const maxDuration = 60;

// Podklad pro fakturu - generuje se on-demand z dat výběru (deterministický,
// neukládá se do Blobu). Vlastník nebo admin.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const isAdmin = isAdminRole(g.session.user?.role);
  const me = salespersonByEmail(g.session.user!.email!);

  const { id } = await params;
  const payout = await getPayout(id);
  if (!payout) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (!isAdmin && me?.id !== payout.salespersonId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let pdf: Buffer;
  try {
    pdf = await renderPayoutPodkladPdf(payout);
  } catch (err) {
    console.error("[payouts] podklad PDF failed", err);
    return NextResponse.json(
      { ok: false, error: "Generování podkladu selhalo." },
      { status: 500 },
    );
  }

  const filename = `podklad-provize-${payout.variableSymbol.replace("/", "-")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
