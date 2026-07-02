import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { unapproveInvoice, InvoicingError } from "@/lib/portal/invoicing";
import { bustInvoices } from "@/lib/portal/revalidate";

// Vzít zpět schválení faktury → návrh. Poslední číslo řady se uvolní,
// starší zůstává rezervované na návrhu (nepřerušená řada). Jen admin.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { id } = await params;
  try {
    const { invoice, releasedNumber } = await unapproveInvoice(
      id,
      g.session.user?.email ?? "admin",
    );
    bustInvoices();
    return NextResponse.json({ ok: true, invoice, releasedNumber });
  } catch (err) {
    if (err instanceof InvoicingError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    console.error("[invoices] unapprove failed", err);
    return NextResponse.json(
      { ok: false, error: "Vrácení schválení selhalo." },
      { status: 500 },
    );
  }
}
