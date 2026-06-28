import type { ReceiptDetail } from "@/lib/portal/pos/types";
import { formatPosMoney } from "@/components/portal/pos/pos-shared";

// Tělo detailu účtenky (KPI + položky + platby). Čistě prezentační, bez hooků a
// bez server-only importu - sdílí ho stránka detailu (server) i ReceiptModal
// (client), aby modal a deep-link ukazovaly přesně totéž. Doklad zůstává v
// NATIVNÍ měně účtenky (nepřepočítává se).
export function ReceiptDetailView({ receipt: r }: { receipt: ReceiptDetail }) {
  const cur = r.currency;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Meta label="Celkem (s DPH)" value={formatPosMoney(r.gross, cur)} strong />
        <Meta label="Bez DPH" value={formatPosMoney(r.net, cur)} />
        <Meta label="DPH" value={formatPosMoney(r.vat, cur)} />
        <Meta label="Položek" value={String(r.items_count)} />
      </div>

      {r.items.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Položky</h3>
          <div className="overflow-x-auto rounded-2xl border border-edge bg-paper">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-edge text-left text-[11px] uppercase tracking-[0.1em] text-ink-mid">
                  <th className="px-4 py-2.5 font-medium">Produkt</th>
                  <th className="px-4 py-2.5 text-right font-medium">Množství</th>
                  <th className="px-4 py-2.5 text-right font-medium">J. cena</th>
                  <th className="px-4 py-2.5 text-right font-medium">Řádek</th>
                  <th className="px-4 py-2.5 text-right font-medium">DPH</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((it) => (
                  <tr key={it.id} className="border-b border-edge/60 last:border-0">
                    <td className="px-4 py-2.5 text-ink-base">{it.product_name || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-deep">{it.qty}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-mid">
                      {formatPosMoney(it.unit_price_gross, cur)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-base">
                      {formatPosMoney(it.line_total_gross, cur)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-mid">
                      {it.vat_rate != null ? `${Number(it.vat_rate)} %` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {r.payments.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Platby</h3>
          <div className="flex flex-col gap-1.5">
            {r.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-edge bg-paper px-4 py-2.5 text-[13px]"
              >
                <span className="text-ink-deep">{p.payment_method_name || p.payment_method}</span>
                <span className="font-semibold tabular-nums text-ink-base">{formatPosMoney(p.amount, p.currency)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Meta({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl border border-edge bg-paper p-4">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-mid">{label}</div>
      <div
        className={`mt-1.5 tabular-nums ${strong ? "text-[1.2rem] font-extrabold text-ink-base" : "text-[15px] font-semibold text-ink-deep"}`}
      >
        {value}
      </div>
    </div>
  );
}
