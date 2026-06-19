import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { isAdminRole, requireSession } from "@/lib/portal/auth-guard";
import { salespersonByEmail } from "@/lib/portal/commissions";
import { getPayout } from "@/lib/portal/payouts-db";

export const maxDuration = 60;

// Stažení nahrané faktury - proxy stream privátního blobu (vzor jako u smluv).
// Vlastník nebo admin.
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
  if (!payout.invoicePath) {
    return NextResponse.json({ ok: false, error: "Faktura nenahrána." }, { status: 404 });
  }

  try {
    const result = await get(payout.invoicePath, { access: "private" });
    if (!result?.stream) {
      return NextResponse.json({ ok: false, error: "Blob nelze otevřít." }, { status: 500 });
    }
    const filename = `faktura-${payout.variableSymbol.replace("/", "-")}.pdf`;
    return new Response(result.stream as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    console.error("[payouts] invoice download failed", err);
    return NextResponse.json({ ok: false, error: "Stažení selhalo." }, { status: 500 });
  }
}
