import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { COMPARISON_LABEL, parsePosFilter, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import {
  getAllShops,
  getDailyTrend,
  getDaypart,
  getHeatmap,
  getKpiSummary,
  getPaymentMix,
  getTopProducts,
  getVatSplit,
} from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import type { Daypart, DayPoint, SummaryRow } from "@/lib/portal/pos/types";
import { PosKpiCard } from "@/components/portal/pos/PosKpiCard";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
import { PosHeatmap } from "@/components/portal/pos/PosHeatmap";
import { PosBars, type BarRow } from "@/components/portal/pos/PosBars";
import {
  BarsRowSkeleton,
  ChartSkeleton,
  KpiStripSkeleton,
} from "@/components/portal/pos/skeletons";
import {
  DAYPART_LABEL,
  formatPosMoney,
  formatPosMoneyCompact,
  formatPosNumber,
  normalizeVatRate,
  signedMoneyCompact,
  signedNumber,
} from "@/components/portal/pos/pos-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokladna - Detail provozovny" };

const DP_ORDER: Daypart[] = ["rano", "dopoledne", "poledne", "odpoledne", "vecer", "noc"];

function fmtDayLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

function searchParamsToUsp(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") usp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") usp.set(k, v[0]);
  }
  return usp;
}

function pickRow(rows: SummaryRow[] | null, currency: string): SummaryRow | null {
  return rows?.find((r) => r.currency === currency) ?? null;
}

// Detail provozovny - sekce streamují nezávisle pod <Suspense>. Klíčové: heatmapa
// (DW endpoint ~3,7 s) má vlastní boundary, takže neblokuje hlavičku/KPI/graf,
// které dostreamují do ~1 s.
export default async function PosShopDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const { shopId } = await params;
  const baseFilter = parsePosFilter(searchParamsToUsp(await searchParams));
  const filter: PosFilter = { ...baseFilter, scope: { kind: "shop", shopId } };
  const cur = filter.currency;
  const useNet = !filter.vatInclusive;
  const backQs = serializePosFilter(baseFilter).toString();
  const backHref = `/portal/pos/provozovny${backQs ? `?${backQs}` : ""}`;

  if (!isPosApiConfigured()) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href={backHref} />
        <Notice title="POS data nejsou nakonfigurovaná" body="Nastavte POS_API_BASE a POS_API_KEY (Vercel)." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={backHref} />

      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <div className="h-7 w-56 animate-pulse rounded-lg bg-edge-warm" />
            <KpiStripSkeleton />
            <ChartSkeleton height={240} />
          </div>
        }
      >
        <DetailHeader shopId={shopId} filter={filter} cur={cur} useNet={useNet} />
      </Suspense>

      <section className="flex flex-col gap-3">
        <H2>Hodina x den</H2>
        <Suspense fallback={<ChartSkeleton height={300} />}>
          <HeatmapSection filter={filter} cur={cur} />
        </Suspense>
      </section>

      <Suspense fallback={<BarsRowSkeleton />}>
        <BreakdownSection filter={filter} cur={cur} useNet={useNet} />
      </Suspense>

      <Suspense fallback={<ChartSkeleton height={200} />}>
        <ProductsSection filter={filter} cur={cur} useNet={useNet} />
      </Suspense>
    </div>
  );
}

async function DetailHeader({
  shopId,
  filter,
  cur,
  useNet,
}: {
  shopId: string;
  filter: PosFilter;
  cur: string;
  useNet: boolean;
}) {
  let kpi: Awaited<ReturnType<typeof getKpiSummary>>;
  let trend: Awaited<ReturnType<typeof getDailyTrend>>;
  let shopsRaw: Awaited<ReturnType<typeof getAllShops>>;
  try {
    [kpi, trend, shopsRaw] = await Promise.all([getKpiSummary(filter), getDailyTrend(filter), getAllShops()]);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst data provozovny." />;
  }
  const shopName = shopsRaw.find((s) => s.id === shopId)?.name ?? "Provozovna";
  const c = pickRow(kpi.current, cur);
  const p = pickRow(kpi.comparison, cur);
  const days = trend.current;
  const sparkNet = days.map((d) => d.net);
  const sparkGross = days.map((d) => d.gross);
  const sparkReceipts = days.map((d) => d.receipts);
  const sparkAtv = days.map((d) => (d.receipts > 0 ? d.gross / d.receipts : 0));

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-[1.5rem] font-extrabold leading-tight tracking-[-0.025em] text-ink-base">{shopName}</h2>

      {c ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <PosKpiCard
            label="Čisté tržby"
            value={formatPosMoneyCompact(c.net, cur)}
            valueTitle={formatPosMoney(c.net, cur)}
            current={c.net}
            previous={p?.net ?? null}
            absolute={p ? signedMoneyCompact(c.net - p.net, cur) : undefined}
            spark={sparkNet}
            emphasis
          />
          <PosKpiCard
            label="Hrubé tržby"
            value={formatPosMoneyCompact(c.gross, cur)}
            valueTitle={formatPosMoney(c.gross, cur)}
            current={c.gross}
            previous={p?.gross ?? null}
            absolute={p ? signedMoneyCompact(c.gross - p.gross, cur) : undefined}
            spark={sparkGross}
          />
          <PosKpiCard
            label="Účtenky"
            value={formatPosNumber(c.receipts)}
            current={c.receipts}
            previous={p?.receipts ?? null}
            absolute={p ? signedNumber(c.receipts - p.receipts) : undefined}
            spark={sparkReceipts}
          />
          <PosKpiCard
            label="Průměrná útrata"
            value={c.avg_ticket != null ? formatPosMoney(c.avg_ticket, cur) : "—"}
            current={c.avg_ticket ?? undefined}
            previous={p?.avg_ticket ?? null}
            spark={sparkAtv}
          />
        </div>
      ) : (
        <Notice title={`Pro ${cur} nejsou v tomto období data`} body="Zkuste jiné období nebo měnu ve filtru nahoře." />
      )}

      <section className="flex flex-col gap-3">
        <H2>Vývoj tržeb ({useNet ? "čisté" : "s DPH"})</H2>
        <Trend trend={trend} filter={filter} useNet={useNet} />
      </section>
    </div>
  );
}

async function HeatmapSection({ filter, cur }: { filter: PosFilter; cur: string }) {
  let heatmap: Awaited<ReturnType<typeof getHeatmap>>;
  try {
    heatmap = await getHeatmap(filter);
  } catch {
    return <WidgetError />;
  }
  return <PosHeatmap cells={heatmap} currency={cur} />;
}

async function BreakdownSection({ filter, cur, useNet }: { filter: PosFilter; cur: string; useNet: boolean }) {
  let daypart: Awaited<ReturnType<typeof getDaypart>>;
  let paymentMix: Awaited<ReturnType<typeof getPaymentMix>>;
  let vatSplit: Awaited<ReturnType<typeof getVatSplit>>;
  try {
    [daypart, paymentMix, vatSplit] = await Promise.all([getDaypart(filter), getPaymentMix(filter), getVatSplit(filter)]);
  } catch {
    return <WidgetError />;
  }

  const dpByKey = new Map(daypart.map((d) => [d.daypart, d]));
  const daypartRows: BarRow[] = DP_ORDER.filter((k) => dpByKey.has(k)).map((k) => {
    const d = dpByKey.get(k)!;
    return { key: k, label: DAYPART_LABEL[k], value: useNet ? d.net : d.gross, sub: `${formatPosNumber(d.receipts)} úč.` };
  });

  const payRows: BarRow[] = [...paymentMix]
    .sort((a, b) => b.total - a.total)
    .map((pm) => ({
      key: pm.payment_method,
      label: pm.payment_method_name || pm.payment_method,
      value: pm.total,
      sub: `${formatPosNumber(pm.payments)}×`,
    }));
  const hasPlaceholder = paymentMix.some((pm) => /placeholder|dotykacka_total/i.test(pm.payment_method));

  const vatMap = new Map<number, { gross: number; vat: number }>();
  for (const v of vatSplit) {
    const nr = normalizeVatRate(v.vat_rate) ?? -1;
    const agg = vatMap.get(nr) ?? { gross: 0, vat: 0 };
    agg.gross += v.gross;
    agg.vat += v.vat;
    vatMap.set(nr, agg);
  }
  const vatRows: BarRow[] = [...vatMap.entries()]
    .sort((a, b) => b[1].gross - a[1].gross)
    .map(([nr, v]) => ({
      key: String(nr),
      label: nr < 0 ? "Neznámá sazba" : `${Math.round(nr * 100)} %`,
      value: v.gross,
      sub: `DPH ${formatPosMoneyCompact(v.vat, cur)}`,
    }));

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="flex flex-col gap-3">
        <H2>Denní doba</H2>
        <PosBars rows={daypartRows} formatValue={(v) => formatPosMoneyCompact(v, cur)} />
      </section>
      <section className="flex flex-col gap-3">
        <H2>Platby</H2>
        <PosBars rows={payRows} formatValue={(v) => formatPosMoneyCompact(v, cur)} />
        {hasPlaceholder && (
          <p className="text-[11px] text-ink-soft">
            Pozn.: u Dotykačky není rozpad hotovost/karta - většina objemu je v souhrnné položce.
          </p>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <H2>DPH</H2>
        <PosBars rows={vatRows} formatValue={(v) => formatPosMoneyCompact(v, cur)} />
      </section>
    </div>
  );
}

async function ProductsSection({ filter, cur, useNet }: { filter: PosFilter; cur: string; useNet: boolean }) {
  let products: Awaited<ReturnType<typeof getTopProducts>>;
  try {
    products = await getTopProducts(filter, "gross", 15);
  } catch {
    return null;
  }
  if (products.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <H2>Top produkty</H2>
      <div className="overflow-x-auto rounded-2xl border border-edge bg-paper">
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-edge text-left text-[11px] uppercase tracking-[0.1em] text-ink-mid">
              <th className="px-4 py-2.5 font-medium">Produkt</th>
              <th className="px-4 py-2.5 text-right font-medium">Množství</th>
              <th className="px-4 py-2.5 text-right font-medium">Tržby</th>
            </tr>
          </thead>
          <tbody>
            {products.map((pr) => (
              <tr key={pr.product_id} className="border-b border-edge/60 last:border-0">
                <td className="px-4 py-2.5 text-ink-base">{pr.name || "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-mid">{formatPosNumber(pr.qty, 0)}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-base">
                  {formatPosMoney(useNet ? pr.net : pr.gross, cur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Trend({
  trend,
  filter,
  useNet,
}: {
  trend: Awaited<ReturnType<typeof getDailyTrend>>;
  filter: PosFilter;
  useNet: boolean;
}) {
  if (trend.current.length === 0) {
    return (
      <div className="grid h-[180px] place-items-center rounded-2xl border border-edge bg-paper text-[13px] text-ink-mid">
        Pro zvolené období nejsou data.
      </div>
    );
  }
  const pick = (d: DayPoint) => (useNet ? d.net : d.gross);
  const current = trend.current.map((d) => ({ label: fmtDayLabel(d.date), value: pick(d) }));
  const comparison = trend.comparison ? trend.comparison.map(pick) : null;
  return (
    <PosLineChart
      current={current}
      comparison={comparison}
      currency={filter.currency}
      comparisonLabel={COMPARISON_LABEL[filter.comparison]}
      height={240}
    />
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">{children}</h2>;
}

function WidgetError() {
  return (
    <div className="rounded-2xl border border-edge bg-paper px-4 py-6 text-center text-[13px] text-ink-mid">
      Data dočasně nedostupná.
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
      Zpět na provozovny
    </Link>
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
