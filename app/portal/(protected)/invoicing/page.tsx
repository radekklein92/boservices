import { PageHeader } from "@/components/portal/shell/PageHeader";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { cachedListInvoices } from "@/lib/portal/cached-db";
import { addMonthKey, monthKeyOf, FEES_MIN_MONTH } from "@/lib/portal/fees-page";
import { InvoicingClient } from "@/components/portal/invoicing/InvoicingClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fakturace" };

// Fakturace poplatků (sekce Finance). Jeden seznam všech faktur napříč měsíci,
// měsíc je jen filtr. Viditelnost = všichni přihlášení (jako Poplatky); mutace
// (generovat/schválit) hlídá API přes requireAdmin.
export default async function InvoicingPage() {
  const [session, invoices] = await Promise.all([
    getSession(),
    cachedListInvoices(),
  ]);
  const isAdmin = isAdminRole(session?.user?.role);

  // Fakturují se jen UZAVŘENÉ měsíce (od floor Poplatků po předchozí měsíc) -
  // možnosti filtru a cíl generování.
  const currentMonth = monthKeyOf(new Date());
  const months: string[] = [];
  for (let m = FEES_MIN_MONTH; m < currentMonth; m = addMonthKey(m, 1)) {
    months.push(m);
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Finance"
        title="Fakturace"
        lede="Měsíční faktury klientům vygenerované z Poplatků - návrhy vznikají automaticky 1. den měsíce za právě skončený měsíc (řádky Poplatků = položky faktury). Návrh se neupravuje: schválením dostane číslo a stane se daňovým dokladem, opravy se dělají v Poplatcích a návrhy se přegenerují."
      />
      <InvoicingClient invoices={invoices} months={months} isAdmin={isAdmin} />
    </div>
  );
}
