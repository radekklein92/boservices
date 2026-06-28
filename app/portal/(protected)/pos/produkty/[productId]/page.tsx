import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { posFilterFromSearchParams, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import { getProductDetail } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { CONCEPT_LABEL } from "@/components/portal/locations/locations-shared";
import { PosKpiCard } from "@/components/portal/pos/PosKpiCard";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
import { ChartSkeleton, KpiStripSkeleton, LeaderboardSkeleton } from "@/components/portal/pos/skeletons";
import {
  formatPosMoney,
  formatPosMoneyCompact,
  formatPosNumber,
} from "@/components/portal/pos/pos-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tržby - Detail produktu" };

function fmtDayLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

// Detail jednoho produktu: kde se prodává (rozpad po prodejnách) + denní trend,
// v rámci aktuálního výběru a období. Plná stránka (ze žebříčku Produkty).
export default async function PosProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const { productId: raw } = await params;
  const productId = decodeURIComponent(raw);
  const filter = posFilterFromSearchParams(await searchParams);
  const backQs = serializePosFilter(filter).toString();
  const backHref = `/portal/pos/produkty${backQs ? `?${backQs}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={backHref} className="inline-flex items-center gap-1.5 transition-colors hover:text-ink-base">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Produkty
          </Link>
        }
        title="Detail produktu"
      />

      {!isPosApiConfigured() ? (
        <Notice title="POS data nejsou nakonfigurovaná" body="Nastavte POS_API_BASE a POS_API_KEY (Vercel)." />
      ) : (
        <Suspense
          fallback={
            <div className="flex flex-col gap-6">
              <KpiStripSkeleton />
              <ChartSkeleton height={240} />
              <LeaderboardSkeleton rows={8} />
            </div>
          }
        >
          <ProductDetailContent productId={productId} filter={filter} backQs={backQs} />
        </Suspense>
      )}
    </>
  );
}

async function ProductDetailContent({
  productId,
  filter,
  backQs,
}: {
  productId: string;
  filter: PosFilter;
  backQs: string;
}) {
  const useNet = !filter.vatInclusive;
  let d: Awaited<ReturnType<typeof getProductDetail>>;
  try {
    d = await getProductDetail(productId, filter);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst detail produktu z API Data Warehouse." />;
  }

  if (d.byLocation.length === 0) {
    return (
      <Notice title="Pro tento produkt nejsou v daném výběru data" body="Zkuste jiné období, výběr nebo měnu ve filtru." />
    );
  }

  const cur = d.currency;
  const revenue = useNet ? d.totalNet : d.totalGross;
  const unit = d.totalQty > 0 ? revenue / d.totalQty : null;
  const maxGross = Math.max(...d.byLocation.map((r) => r.gross), 1);
  const chart = d.daily.map((p) => ({ label: fmtDayLabel(p.date), value: useNet ? p.net : p.gross }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink-base">{d.name || "Produkt"}</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <PosKpiCard
          label={`Tržby (${useNet ? "bez DPH" : "s DPH"})`}
          value={formatPosMoneyCompact(revenue, cur)}
          valueTitle={formatPosMoney(revenue, cur)}
          emphasis
        />
        <PosKpiCard label="Množství" value={formatPosNumber(d.totalQty, 0)} />
        <PosKpiCard label="Ø cena" value={unit != null ? formatPosMoney(unit, cur) : "—"} />
        <PosKpiCard label="Prodejen" value={formatPosNumber(d.byLocation.length, 0)} />
      </div>

      {chart.length > 1 && (
        <section className="flex flex-col gap-3">
          <H2>Vývoj prodeje ({useNet ? "bez DPH" : "s DPH"})</H2>
          <PosLineChart current={chart} currency={cur} height={240} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <H2>Kde se prodává</H2>
        <div className="overflow-x-auto rounded-2xl border border-edge bg-paper">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-edge text-left text-[11px] uppercase tracking-[0.1em] text-ink-mid">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Prodejna</th>
                <th className="px-4 py-3 text-right font-medium">Množství</th>
                <th className="px-4 py-3 text-right font-medium">{useNet ? "Tržby bez DPH" : "Tržby s DPH"}</th>
              </tr>
            </thead>
            <tbody>
              {d.byLocation.map((r, i) => {
                const val = useNet ? r.net : r.gross;
                const href = `/portal/pos/prodejny/${encodeURIComponent(r.locationId)}${backQs ? `?${backQs}` : ""}`;
                return (
                  <tr key={r.locationId} className="border-b border-edge/60 last:border-0 hover:bg-edge-warm/60">
                    <td className="px-4 py-2.5 tabular-nums text-ink-soft">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-1">
                        <Link href={href} className="font-medium text-ink-base">
                          {r.name}
                        </Link>
                        <span className="text-[11.5px] text-ink-soft">{CONCEPT_LABEL[r.concept]}</span>
                        <span className="h-1 w-full max-w-[200px] overflow-hidden rounded-full bg-edge">
                          <span
                            className="block h-full rounded-full bg-ink-base"
                            style={{ width: `${Math.max(2, (r.gross / maxGross) * 100)}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-deep">{formatPosNumber(r.qty, 0)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-base">
                      {formatPosMoney(val, cur)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">{children}</h2>;
}
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-edge bg-paper p-6">
      <div className="text-[14px] font-semibold text-ink-base">{title}</div>
      <p className="mt-1.5 max-w-[60ch] text-[13px] text-ink-mid">{body}</p>
    </div>
  );
}
