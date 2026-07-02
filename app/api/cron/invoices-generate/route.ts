import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/portal/cron-auth";
import { addMonthKey, monthKeyOf, FEES_MIN_MONTH } from "@/lib/portal/fees-page";
import { generateInvoiceDrafts, InvoicingError } from "@/lib/portal/invoicing";
import { bustInvoices } from "@/lib/portal/revalidate";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Měsíční generování návrhů faktur z Poplatků - běží 1. den měsíce ráno
// (vercel.json: "0 5 1 * *" UTC = 6:00/7:00 Praha) a vytvoří návrhy za právě
// skončený měsíc. Admin je pak na /portal/invoicing schválí. Selhání DW → 500
// (viditelné ve Vercel logu; admin dogeneruje tlačítkem na stránce).
export async function GET(req: Request) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const month = addMonthKey(monthKeyOf(new Date()), -1);
  if (month < FEES_MIN_MONTH) {
    return NextResponse.json({ ok: true, skipped: true, month });
  }

  try {
    const result = await generateInvoiceDrafts(month, "cron", "cron");
    bustInvoices();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message =
      err instanceof InvoicingError ? err.message : "Generování selhalo.";
    console.error("[cron invoices-generate] failed", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
