import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { PosSubNav } from "@/components/portal/pos/PosSubNav";
import {
  COMPARISON_LABEL,
  parsePosFilter,
  serializePosFilter,
  type PosFilter,
} from "@/lib/portal/pos/filters";
import { getDailyTrend, getHourlyTrend, getKpiSummary, getLocationLeaderboardFull, getPeriodTotals } from "@/lib/portal/pos/queries";
import { getDefaultView } from "@/lib/portal/pos/views-db";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import type { DayPoint, HourPoint, LocationRevenueRowWithPrev, SummaryRow } from "@/lib/portal/pos/types";
import { PosKpiCard } from "@/components/portal/pos/PosKpiCard";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
import { PosDeltaBadge } from "@/components/portal/pos/PosDeltaBadge";
import { PosSyncBadge } from "@/components/portal/pos/PosSyncBadge";
import { PosFilterBarLoader } from "@/components/portal/pos/PosFilterBarLoader";
import { ChartSkeleton, FilterBarSkeleton, KpiStripSkeleton, LeaderboardSkeleton, PanelSkeleton } from "@/components/portal/pos/skeletons";
import {
  formatPosMoney,
  formatPosMoneyCompact,
  formatPosNumber,
  formatPct,
  signedMoneyCompact,
  signedNumber,
} from "@/components/portal/pos/pos-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tržby - Přehled" };

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

export default async function PosOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const spObj = await searchParams;

  // Výchozí pohled se aplikuje JEN na úplně prázdný vstup (URL je king). Po
  // redirectu už searchParams nejsou prázdné -> žádná smyčka.
  if (Object.keys(spObj).length === 0 && session?.user?.email) {
    const def = await getDefaultView(session.user.email);
    if (def?.filter) redirect(`/portal/pos?${def.filter}`);
  }

  const filter = parsePosFilter(searchParamsToUsp(spObj));
  const cur = filter.currency;
  const useNet = !filter.vatInclusive;
  const qs = serializePosFilter(filter).toString();

  return (
    <>
      <PageHeader
        eyebrow="Provoz"
        title="Tržby"
        lede="Pokladní přehled napříč prodejnami a koncepty - tržby, účtenky a žebříčky."
        actions={
          <Suspense fallback={null}>
            <PosSyncBadge />
          </Suspense>
        }
      />

      <PosSubNav />

      <Suspense fallback={<FilterBarSkeleton />}>
        <PosFilterBarLoader />
      </Suspense>

      {!isPosApiConfigured() ? (
        <Notice
          title="POS data nejsou nakonfigurovaná"
          body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel) - dashboard pak začne číst z API Data Warehouse."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <Suspense fallback={<KpiStripSkeleton cards={4} />}>
            <KpiSection filter={filter} cur={cur} useNet={useNet} />
          </Suspense>

          <div className="grid gap-5 lg:grid-cols-3">
            <section className="flex flex-col gap-3 lg:col-span-2">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
                Vývoj tržeb {filter.preset === "dnes" ? "dnes po hodinách " : ""}({useNet ? "bez DPH" : "s DPH"})
              </h2>
              <Suspense fallback={<ChartSkeleton />}>
                <TrendSection filter={filter} useNet={useNet} />
              </Suspense>
            </section>
            <Suspense fallback={<PanelSkeleton />}>
              <PeriodSection filter={filter} cur={cur} useNet={useNet} />
            </Suspense>
          </div>

          <Suspense fallback={<LeaderboardSkeleton />}>
            <HighlightsSection filter={filter} useNet={useNet} qs={qs} />
          </Suspense>
        </div>
      )}
    </>
  );
}

// --- 4 KPI: Tržby (net|gross dle DPH), Účtenky, Průměrný ticket, Refundace ---

async function KpiSection({ filter, cur, useNet }: { filter: PosFilter; cur: string; useNet: boolean }) {
  // Denní zobrazení: férové srovnání "do teď" z hodinových dat (ne celý den vs část dne).
  if (filter.preset === "dnes") return <KpiSectionDaily filter={filter} cur={cur} />;

  let kpi: Awaited<ReturnType<typeof getKpiSummary>>;
  let trend: Awaited<ReturnType<typeof getDailyTrend>>;
  try {
    [kpi, trend] = await Promise.all([getKpiSummary(filter), getDailyTrend(filter)]);
  } catch {
    return <WidgetError />;
  }
  const c = pickRow(kpi.current, cur);
  const p = pickRow(kpi.comparison, cur);
  if (!c) {
    return (
      <Notice
        title={`Pro ${cur} nejsou v tomto období data`}
        body="Zkuste jiné období, výběr prodejen nebo měnu ve filtru nahoře."
      />
    );
  }
  const days = trend.current;
  const sparkRevenue = days.map((d) => (useNet ? d.net : d.gross));
  const sparkReceipts = days.map((d) => d.receipts);
  const sparkAtv = days.map((d) => (d.receipts > 0 ? d.gross / d.receipts : 0));
  const revenue = useNet ? c.net : c.gross;
  const prevRevenue = useNet ? p?.net : p?.gross;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <PosKpiCard
        label={`Tržby (${useNet ? "bez DPH" : "s DPH"})`}
        value={formatPosMoneyCompact(revenue, cur)}
        valueTitle={formatPosMoney(revenue, cur)}
        current={revenue}
        previous={prevRevenue ?? null}
        absolute={prevRevenue != null ? signedMoneyCompact(revenue - prevRevenue, cur) : undefined}
        spark={sparkRevenue}
        emphasis
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
        label="Průměrný ticket"
        value={c.avg_ticket != null ? formatPosMoney(c.avg_ticket, cur) : "—"}
        current={c.avg_ticket ?? undefined}
        previous={p?.avg_ticket ?? null}
        absolute={
          c.avg_ticket != null && p?.avg_ticket != null
            ? signedMoneyCompact(c.avg_ticket - p.avg_ticket, cur)
            : undefined
        }
        spark={sparkAtv}
      />
      <PosKpiCard
        label="Refundace"
        value={c.refund_rate != null ? formatPct(c.refund_rate) : "—"}
        valueTitle={c.refund_rate == null ? "Pro tento výběr zatím neevidováno" : undefined}
        current={c.refund_rate ?? undefined}
        previous={p?.refund_rate ?? null}
        goodDir="down"
        deltaMode="pp"
      />
    </div>
  );
}

// Denní KPI ("Dnes"): rychle ze summary (MV), bez delty - srovnání celého dne vs
// část dne by bylo zavádějící (falešná červená); férové hodinové srovnání se vrátí
// po optimalizaci DW (hodinová data přes celou síť jsou zatím pomalá).
async function KpiSectionDaily({ filter, cur }: { filter: PosFilter; cur: string }) {
  const useNet = !filter.vatInclusive;
  let kpi: Awaited<ReturnType<typeof getKpiSummary>>;
  try {
    kpi = await getKpiSummary(filter);
  } catch {
    return <WidgetError />;
  }
  const c = pickRow(kpi.current, cur);
  if (!c) {
    return (
      <Notice title={`Pro ${cur} dnes zatím nejsou data`} body="Zkuste jiný výběr prodejen nebo měnu ve filtru nahoře." />
    );
  }
  const revenue = useNet ? c.net : c.gross;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <PosKpiCard
        label={`Tržby dnes (${useNet ? "bez DPH" : "s DPH"})`}
        value={formatPosMoneyCompact(revenue, cur)}
        valueTitle={formatPosMoney(revenue, cur)}
        emphasis
      />
      <PosKpiCard label="Účtenky" value={formatPosNumber(c.receipts)} />
      <PosKpiCard
        label="Průměrný ticket"
        value={c.avg_ticket != null ? formatPosMoney(c.avg_ticket, cur) : "—"}
      />
      <PosKpiCard label="Refundace" value={c.refund_rate != null ? formatPct(c.refund_rate) : "—"} />
    </div>
  );
}

async function TrendSection({ filter, useNet }: { filter: PosFilter; useNet: boolean }) {
  if (filter.preset === "dnes") return <TrendSectionDaily filter={filter} useNet={useNet} />;

  let trend: Awaited<ReturnType<typeof getDailyTrend>>;
  try {
    trend = await getDailyTrend(filter);
  } catch {
    return <WidgetError />;
  }
  if (trend.degraded) {
    return (
      <div className="grid h-[200px] place-items-center rounded-2xl border border-edge bg-paper px-6 text-center text-[13px] text-ink-mid">
        Graf trendu není pro tak velký ruční výběr prodejen k dispozici. Vyberte koncept nebo méně prodejen.
      </div>
    );
  }
  if (trend.current.length === 0) {
    return (
      <div className="grid h-[200px] place-items-center rounded-2xl border border-edge bg-paper text-[13px] text-ink-mid">
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
      height={260}
    />
  );
}

// Hodinový graf pro denní zobrazení: dnešní hodiny + srovnávací den (stejné hodiny).
async function TrendSectionDaily({ filter, useNet }: { filter: PosFilter; useNet: boolean }) {
  let hourly: Awaited<ReturnType<typeof getHourlyTrend>>;
  try {
    hourly = await getHourlyTrend(filter);
  } catch {
    return <WidgetError />;
  }
  if (hourly.current.length === 0) {
    return (
      <div className="grid h-[200px] place-items-center rounded-2xl border border-edge bg-paper text-[13px] text-ink-mid">
        Dnes zatím nejsou data.
      </div>
    );
  }
  const pick = (h: HourPoint) => (useNet ? h.net : h.gross);
  const current = hourly.current.map((h) => ({ label: `${h.hour}`, value: pick(h) }));
  const cmpByHour = new Map((hourly.comparison ?? []).map((h) => [h.hour, pick(h)]));
  const comparison = hourly.comparison ? hourly.current.map((h) => cmpByHour.get(h.hour) ?? 0) : null;
  return (
    <PosLineChart
      current={current}
      comparison={comparison}
      currency={filter.currency}
      comparisonLabel={COMPARISON_LABEL[filter.comparison]}
      height={260}
    />
  );
}

async function PeriodSection({ filter, cur, useNet }: { filter: PosFilter; cur: string; useNet: boolean }) {
  let periods: Awaited<ReturnType<typeof getPeriodTotals>>;
  try {
    periods = await getPeriodTotals(filter);
  } catch {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Podle období</h2>
        <WidgetError />
      </section>
    );
  }
  const max = Math.max(...periods.map((x) => (useNet ? x.net : x.gross)), 1);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Podle období</h2>
      <div className="flex flex-1 flex-col gap-1 rounded-2xl border border-edge bg-paper p-2">
        {periods.map((row) => {
          const val = useNet ? row.net : row.gross;
          return (
            <div key={row.key} className="rounded-xl px-3 py-3 transition-colors hover:bg-edge-warm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-medium text-ink-mid">{row.label}</span>
                <span className="text-[15px] font-bold tabular-nums text-ink-base">{formatPosMoney(val, cur)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-edge">
                  <span
                    className="block h-full rounded-full bg-ink-base"
                    style={{ width: `${Math.max(2, (val / max) * 100)}%` }}
                  />
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">
                  {formatPosNumber(row.receipts)} úč.
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type HiRow = { id: string; name: string; value: number; prev: number | null };

async function HighlightsSection({ filter, useNet, qs }: { filter: PosFilter; useNet: boolean; qs: string }) {
  let leaderboard: LocationRevenueRowWithPrev[];
  try {
    leaderboard = await getLocationLeaderboardFull(filter);
  } catch {
    return <WidgetError />;
  }
  const cur = filter.currency;
  const rows: HiRow[] = leaderboard.map((r) => ({
    id: r.locationId,
    name: r.name,
    value: useNet ? r.net : r.gross,
    prev: useNet ? r.prevNet : r.prevGross,
  }));
  if (rows.length === 0) return null;

  const top = [...rows].sort((a, b) => b.value - a.value).slice(0, 5);
  const decliners = rows
    .filter((d) => d.prev != null && d.prev > 0 && (d.value - d.prev) / d.prev <= -0.15 && d.prev >= 1000)
    .sort((a, b) => (a.value - (a.prev as number)) / (a.prev as number) - (b.value - (b.prev as number)) / (b.prev as number))
    .slice(0, 5);

  const allHref = `/portal/pos/prodejny${qs ? `?${qs}` : ""}`;

  return (
    <div className={`grid gap-5 ${decliners.length > 0 ? "lg:grid-cols-2" : ""}`}>
      <HiPanel title="Nejlepší prodejny" href={allHref} rows={top} cur={cur} />
      {decliners.length > 0 && (
        <HiPanel title={`Pokles vs ${COMPARISON_LABEL[filter.comparison].toLowerCase()}`} rows={decliners} cur={cur} />
      )}
    </div>
  );
}

function HiPanel({ title, href, rows, cur }: { title: string; href?: string; rows: HiRow[]; cur: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">{title}</h2>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base"
          >
            Celý žebříček
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-edge/60 px-4 py-2.5 text-[13px] last:border-0">
            <span className="min-w-0 flex-1 truncate text-ink-base">{r.name}</span>
            <span className="shrink-0 tabular-nums text-ink-deep">{formatPosMoneyCompact(r.value, cur)}</span>
            <PosDeltaBadge current={r.value} previous={r.prev} className="w-[64px] shrink-0 justify-end text-[11px]" />
          </div>
        ))}
      </div>
    </section>
  );
}

function WidgetError() {
  return (
    <div className="rounded-2xl border border-edge bg-paper px-4 py-6 text-center text-[13px] text-ink-mid">
      Data dočasně nedostupná.
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
