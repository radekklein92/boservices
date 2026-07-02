import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { generateInvoiceDrafts, InvoicingError } from "@/lib/portal/invoicing";
import { bustInvoices } from "@/lib/portal/revalidate";

// Generátor čte tržby z DW (stejné dotazy jako Poplatky) - může trvat déle.
export const maxDuration = 60;

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

// Vygenerovat/přegenerovat návrhy faktur za uzavřený měsíc. Idempotentní:
// návrhy se přepočtou z aktuálních čísel, schválené faktury zůstávají nedotčené.
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Neplatný požadavek (month = YYYY-MM)." },
      { status: 400 },
    );
  }

  try {
    const result = await generateInvoiceDrafts(
      parsed.data.month,
      g.session.user?.email ?? "admin",
      "manual",
    );
    bustInvoices();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof InvoicingError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    console.error("[invoices] generate failed", err);
    return NextResponse.json(
      { ok: false, error: "Generování návrhů selhalo." },
      { status: 500 },
    );
  }
}
