import { Section } from "@/components/portal/ui/Section";
import type { FeeHistoryEntry } from "@/lib/portal/fees-page";

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMoney(n: number, currency: string): string {
  const v = Math.round(n).toLocaleString("cs-CZ");
  return currency === "CZK" ? `${v} Kč` : `${v} ${currency}`;
}

// Historie skutečně vyčíslených (finálních) poplatků za uzavřené měsíce. Sdílená
// na detailu lokality (showLocation=false) i klienta (showLocation=true). Nic
// nevykreslí, dokud není žádný uzavřený měsíc s reálnými daty.
export function FeeHistorySection({
  entries,
  showLocation = false,
}: {
  entries: FeeHistoryEntry[];
  showLocation?: boolean;
}) {
  if (entries.length === 0) return null;

  const cols = showLocation
    ? ["Období", "Lokalita", "Poplatek", "Částka"]
    : ["Období", "Smlouva", "Poplatek", "Částka"];

  return (
    <Section
      title="Historie poplatků"
      hint="Skutečně vyčíslené poplatky za uzavřené měsíce z reálné tržby bez DPH. Podklad pro fakturaci."
    >
      <div className="overflow-x-auto rounded-2xl border border-edge">
        <table className="w-full border-collapse text-[13px] tabular-nums">
          <thead>
            <tr>
              {cols.map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap border-b border-edge bg-paper-warm px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-mid"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const label = monthLabel(entry.month);
              return entry.rows.map((r, i) => (
                <tr key={r.key} className="transition-colors hover:bg-paper-warm">
                  <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle font-medium text-ink-base">
                    {i === 0 ? label : ""}
                  </td>
                  <td className="border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                    {showLocation ? r.locationName : r.contractLabel}
                  </td>
                  <td className="border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                    {r.periodLabel}
                  </td>
                  <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle font-semibold text-ink-base">
                    {formatMoney(r.amount, r.currency)}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
