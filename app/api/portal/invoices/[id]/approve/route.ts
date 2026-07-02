import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { approveInvoice, InvoicingError } from "@/lib/portal/invoicing";
import { bustInvoices } from "@/lib/portal/revalidate";

// Schválení renderuje PDF přes puppeteer - potřebuje delší limit.
export const maxDuration = 60;

// Schválit návrh faktury → daňový doklad (číslo z řady, datumy, PDF do Blobu).
// Idempotentní: už schválená faktura vrátí { ok: true, already: true }.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { id } = await params;
  try {
    const { invoice, already } = await approveInvoice(
      id,
      g.session.user?.email ?? "admin",
    );
    bustInvoices();
    return NextResponse.json({ ok: true, invoice, already: already ?? false });
  } catch (err) {
    if (err instanceof InvoicingError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    console.error("[invoices] approve failed", err);
    return NextResponse.json(
      { ok: false, error: "Schválení faktury selhalo." },
      { status: 500 },
    );
  }
}
