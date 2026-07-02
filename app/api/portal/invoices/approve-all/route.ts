import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { listAllInvoices, listInvoicesByMonth } from "@/lib/portal/invoices-db";
import { approveInvoice, InvoicingError } from "@/lib/portal/invoicing";
import { bustInvoices } from "@/lib/portal/revalidate";

// Sekvenční schválení N návrhů = N × puppeteer render (~5-10 s/ks).
export const maxDuration = 300;

const schema = z.object({
  // Bez měsíce se schválí všechny návrhy napříč měsíci (stránka zobrazuje
  // jeden seznam, měsíc je jen filtr).
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

// Schválit všechny návrhy (volitelně jen zvoleného měsíce). Sekvenčně a
// v deterministickém pořadí (měsíc, odběratel) - čísla řady pak odpovídají
// abecedě, ne náhodě. Jednotlivá selhání neblokují zbytek.
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Neplatný požadavek (month = YYYY-MM)." },
      { status: 400 },
    );
  }

  const email = g.session.user?.email ?? "admin";
  const invoices = parsed.data.month
    ? await listInvoicesByMonth(parsed.data.month)
    : await listAllInvoices();
  const drafts = invoices
    .filter((i) => i.status === "draft")
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) ||
        a.customer.name.localeCompare(b.customer.name, "cs"),
    );

  const approved: string[] = [];
  const failed: { id: string; customer: string; error: string }[] = [];
  for (const draft of drafts) {
    try {
      const { invoice } = await approveInvoice(draft.id, email);
      approved.push(invoice.number ?? invoice.id);
    } catch (err) {
      failed.push({
        id: draft.id,
        customer: draft.customer.name,
        error:
          err instanceof InvoicingError
            ? err.message
            : "Schválení faktury selhalo.",
      });
      if (!(err instanceof InvoicingError)) {
        console.error("[invoices] approve-all item failed", draft.id, err);
      }
    }
  }

  bustInvoices();
  return NextResponse.json({ ok: true, approved, failed });
}
