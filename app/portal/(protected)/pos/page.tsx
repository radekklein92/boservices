import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { COMPARISON_LABEL, parsePosFilter, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import {
  getAllShops,
  getDailyTrend,
  getKpiSummary,
  getPeriodTotals,
  getShopLeaderboardFull,
} from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import type { DayPoint, ShopRevenueRowWithPrev, SummaryRow } from "@/lib/portal/pos/types";
import { PosKpiCard } from "@/components/portal/pos/PosKpiCard";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
import { PosDeltaBadge } from "@/components/portal/pos/PosDeltaBadge";
import {
  ChartSkeleton,
  KpiGridSkeleton,
  LeaderboardSkeleton,
  PanelSkeleton,
} from "@/components/portal/pos/skeletons";
import {
  formatPosMoney,
  formatPosMoneyCompact,
  formatPosNumber,
  formatPct,
  signedMoneyCompact,
  signedNumber,
} from "@/components/portal/pos/pos-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokladna - Přehled" };

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

// Stránka NEawaituje data - jen session + filtr (levné). Každý widget je vlastní
// async server komponenta pod <Suspense> -> shell + skeletony paintnou hned a
// widgety dostreamují nezávisle (žádný blokující Promise.all přes všechno).
export default async function PosOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const filter = parsePosFilter(searchParamsToUsp(await searchParams));
  const cur = filter.currency;
  const useNet = !filter.vatInclusive;

  if (!isPosApiConfigured()) {
    return (
      <Notice
        title="POS data nejsou nakonfigurovaná"
        body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel) - dashboard pak začne číst z API Data Warehouse."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {filter.comparison === "predchozi-rok" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-edge bg-edge-warm px-4 py-2.5 text-[12.5px] text-ink-deep">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-mid" strokeWidth={1.75} aria-hidden="true" />
          <span>
            Srovnání s předchozím rokem je orientační - síť byla loni výrazně menší (souvislá data od ledna 2026),
            takže delty odrážejí hlavně růst počtu poboček, ne výkon. Pro srovnání výkonu použijte „Předchozí období".
          </span>
        </div>
      )}

      <Suspense fallback={<KpiGridSkeleton />}>
        <KpiSection filter={filter} cur={cur} />
      </Suspense>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
            Vývoj tržeb ({useNet ? "čisté" : "s DPH"})
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
        <HighlightsSection filter={filter} useNet={useNet} />
      </Suspense>
    </div>
  );
}

// --- Widget sekce (každá fetchne svůj slice; chyba/prázdno degraduje lokálně) ---

async function KpiSection({ filter, cur }: { filter: PosFilter; cur: string }) {
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
        body="Zkuste jiné období, značku nebo měnu ve filtru nahoře."
      />
    );
  }
  const days = trend.current;
  const sparkNet = days.map((d) => d.net);
  const sparkGross = days.map((d) => d.gross);
  const sparkReceipts = days.map((d) => d.receipts);
  const sparkVat = days.map((d) => Math.max(0, d.gross - d.net));
  const sparkAtv = days.map((d) => (d.receipts > 0 ? d.gross / d.receipts : 0));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        absolute={c.avg_ticket != null && p?.avg_ticket != null ? signedMoneyCompact(c.avg_ticket - p.avg_ticket, cur) : undefined}
        spark={sparkAtv}
      />
      <PosKpiCard
        label="Refundace"
        value={c.refund_rate != null ? formatPct(c.refund_rate) : "—"}
        current={c.refund_rate ?? undefined}
        previous={p?.refund_rate ?? null}
        goodDir="down"
        deltaMode="pp"
      />
      <PosKpiCard
        label="DPH"
        value={formatPosMoneyCompact(c.vat, cur)}
        valueTitle={formatPosMoney(c.vat, cur)}
        current={c.vat}
        previous={p?.vat ?? null}
        absolute={p ? signedMoneyCompact(c.vat - p.vat, cur) : undefined}
        spark={sparkVat}
      />
    </div>
  );
}

async function TrendSection({ filter, useNet }: { filter: PosFilter; useNet: boolean }) {
  let trend: Awaited<ReturnType<typeof getDailyTrend>>;
  try {
    trend = await getDailyTrend(filter);
  } catch {
    return <WidgetError />;
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

async function HighlightsSection({ filter, useNet }: { filter: PosFilter; useNet: boolean }) {
  let leaderboard: ShopRevenueRowWithPrev[];
  let shopsRaw: Awaited<ReturnType<typeof getAllShops>>;
  try {
    [leaderboard, shopsRaw] = await Promise.all([getShopLeaderboardFull(filter), getAllShops()]);
  } catch {
    return <WidgetError />;
  }
  const shopName = new Map(shopsRaw.map((s) => [s.id, s.name]));
  const cur = filter.currency;
  const rows: HiRow[] = leaderboard
    .filter((r) => shopName.has(r.shop_id))
    .map((r) => ({
      id: r.shop_id,
      name: shopName.get(r.shop_id) as string,
      value: useNet ? r.net : r.gross,
      prev: useNet ? r.prevNet : r.prevGross,
    }));
  if (rows.length === 0) return null;

  const top = [...rows].sort((a, b) => b.value - a.value).slice(0, 5);
  const decliners = rows
    .filter((d) => d.prev != null && d.prev > 0 && (d.value - d.prev) / d.prev <= -0.15 && d.prev >= 1000)
    .sort((a, b) => (a.value - (a.prev as number)) / (a.prev as number) - (b.value - (b.prev as number)) / (b.prev as number))
    .slice(0, 5);

  const qs = serializePosFilter(filter).toString();
  const allHref = `/portal/pos/provozovny${qs ? `?${qs}` : ""}`;

  return (
    <div className={`grid gap-5 ${decliners.length > 0 ? "lg:grid-cols-2" : ""}`}>
      <HiPanel title="Nejlepší provozovny" href={allHref} rows={top} cur={cur} />
      {decliners.length > 0 && (
        <HiPanel title={`Pokles vs ${COMPARISON_LABEL[filter.comparison].toLowerCase()}`} rows={decliners} cur={cur} />
      )}
    </div>
  );
}

function HiPanel({
  title,
  href,
  rows,
  cur,
}: {
  title: string;
  href?: string;
  rows: HiRow[];
  cur: string;
}) {
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
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 border-b border-edge/60 px-4 py-2.5 text-[13px] last:border-0"
          >
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
