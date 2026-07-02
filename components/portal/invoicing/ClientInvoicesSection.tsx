import { FileDown } from "lucide-react";
import { Section } from "@/components/portal/ui/Section";
import { Chip } from "@/components/portal/ui/Chip";
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLE,
  type Invoice,
} from "@/lib/portal/invoices-db";

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatAmount(n: number, currency: string): string {
  const v = n.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "CZK" ? `${v} Kč` : `${v} ${currency}`;
}

// Faktury klienta na jeho detailu - read-only zrcadlo stránky Fakturace
// (schvalování a generování se dělá tam). Nic nevykreslí, dokud klient
// žádnou fakturu nemá.
export function ClientInvoicesSection({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) return null;

  return (
    <Section
      title="Faktury"
      hint="Měsíční faktury za poplatky vygenerované z Poplatků. Schvalují se na stránce Fakturace."
    >
      <div className="overflow-x-auto rounded-2xl border border-edge">
        <table className="w-full border-collapse text-[13px] tabular-nums">
          <thead>
            <tr>
              {["Období", "Číslo", "Položek", "Základ daně", "Celkem s DPH", "Stav", ""].map(
                (h, i) => (
                  <th
                    key={i}
                    className={`whitespace-nowrap border-b border-edge bg-paper-warm px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-mid ${
                      i === 2 || i === 3 || i === 4 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="transition-colors hover:bg-paper-warm">
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle font-medium text-ink-base">
                  {monthLabel(inv.month)}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle font-mono text-[12px] text-ink-deep">
                  {inv.number ?? "-"}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 text-right align-middle text-ink-deep">
                  {inv.items.length}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 text-right align-middle text-ink-deep">
                  {formatAmount(inv.totals.base, inv.currency)}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 text-right align-middle font-semibold text-ink-base">
                  {formatAmount(inv.totals.total, inv.currency)}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle">
                  <Chip tone={INVOICE_STATUS_STYLE[inv.status]}>
                    {INVOICE_STATUS_LABEL[inv.status]}
                  </Chip>
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle text-right">
                  <a
                    href={`/api/portal/invoices/${inv.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-mid underline-offset-2 transition-colors hover:text-ink-base hover:underline"
                    title={inv.status === "draft" ? "PDF návrhu (s vodoznakem)" : "PDF faktury"}
                  >
                    <FileDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
