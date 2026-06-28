import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { posFilterFromSearchParams, serializePosFilter } from "@/lib/portal/pos/filters";
import { getReceiptDetail } from "@/lib/portal/pos/queries";
import type { ReceiptDetail } from "@/lib/portal/pos/types";
import { formatLocalDateTime, formatPosMoney } from "@/components/portal/pos/pos-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokladna - Detail účtenky" };

export default async function PosReceiptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const { id } = await params;
  const backQs = serializePosFilter(posFilterFromSearchParams(await searchParams)).toString();
  const backHref = backQs ? `/portal/pos/uctenky?${backQs}` : "/portal/pos/uctenky";

  let r: ReceiptDetail;
  try {
    r = await getReceiptDetail(id);
  } catch {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href={backHref} />
        <Notice title="Účtenka nenalezena" body="Doklad se nepodařilo načíst z API Data Warehouse." />
      </div>
    );
  }

  const cur = r.currency;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={backHref} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.4rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-base">
            {r.shop_name || "Účtenka"}
          </h2>
          <p className="mt-1 text-[13px] text-ink-mid">
            {formatLocalDateTime(r.opened_at)} · {r.source}
            {r.channel ? ` · ${r.channel}` : ""}
          </p>
        </div>
        {r.is_refund && (
          <span className="rounded-md bg-rose-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700">
            Refundace
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Meta label="Celkem (s DPH)" value={formatPosMoney(r.gross, cur)} strong />
        <Meta label="Bez DPH" value={formatPosMoney(r.net, cur)} />
        <Meta label="DPH" value={formatPosMoney(r.vat, cur)} />
        <Meta label="Položek" value={String(r.items_count)} />
      </div>

      {r.items.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Položky</h3>
          <div className="overflow-x-auto rounded-2xl border border-edge bg-paper">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
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

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      Zpět na účtenky
    </Link>
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

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-edge bg-paper p-6">
      <div className="text-[14px] font-semibold text-ink-base">{title}</div>
      <p className="mt-1.5 max-w-[60ch] text-[13px] text-ink-mid">{body}</p>
    </div>
  );
}
