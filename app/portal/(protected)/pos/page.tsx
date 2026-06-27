import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { COMPARISON_LABEL, parsePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import {
  getAllShops,
  getDailyTrend,
  getKpiSummary,
  getPeriodTotals,
  getShopLeaderboardFull,
} from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import type { DayPoint, SummaryRow } from "@/lib/portal/pos/types";
import { PosKpiCard } from "@/components/portal/pos/PosKpiCard";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
import { PosDeltaBadge } from "@/components/portal/pos/PosDeltaBadge";
import {
  formatPosMoney,
  formatPosMoneyCompact,
  formatPosNumber,
  formatPct,
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

  let kpi: Awaited<ReturnType<typeof getKpiSummary>>;
  let trend: Awaited<ReturnType<typeof getDailyTrend>>;
  let periods: Awaited<ReturnType<typeof getPeriodTotals>>;
  try {
    [kpi, trend, periods] = await Promise.all([
      getKpiSummary(filter),
      getDailyTrend(filter),
      getPeriodTotals(filter),
    ]);
  } catch {
    return (
      <Notice
        title="Data dočasně nedostupná"
        body="Nepodařilo se načíst data z API Data Warehouse. Zkuste to za chvíli."
      />
    );
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
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PosKpiCard
          label="Čisté tržby"
          value={formatPosMoneyCompact(c.net, cur)}
          valueTitle={formatPosMoney(c.net, cur)}
          current={c.net}
          previous={p?.net ?? null}
          spark={sparkNet}
          emphasis
        />
        <PosKpiCard
          label="Hrubé tržby"
          value={formatPosMoneyCompact(c.gross, cur)}
          valueTitle={formatPosMoney(c.gross, cur)}
          current={c.gross}
          previous={p?.gross ?? null}
          spark={sparkGross}
        />
        <PosKpiCard
          label="Účtenky"
          value={formatPosNumber(c.receipts)}
          current={c.receipts}
          previous={p?.receipts ?? null}
          spark={sparkReceipts}
        />
        <PosKpiCard
          label="Průměrná útrata"
          value={c.avg_ticket != null ? formatPosMoney(c.avg_ticket, cur) : "—"}
          current={c.avg_ticket ?? undefined}
          previous={p?.avg_ticket ?? null}
          spark={sparkAtv}
        />
        <PosKpiCard
          label="Refundace"
          value={c.refund_rate != null ? formatPct(c.refund_rate) : "—"}
          current={c.refund_rate ?? undefined}
          previous={p?.refund_rate ?? null}
          goodDir="down"
        />
        <PosKpiCard
          label="DPH"
          value={formatPosMoneyCompact(c.vat, cur)}
          valueTitle={formatPosMoney(c.vat, cur)}
          current={c.vat}
          previous={p?.vat ?? null}
          spark={sparkVat}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
            Vývoj tržeb ({useNet ? "čisté" : "s DPH"})
          </h2>
          <Trend trend={trend} filter={filter} useNet={useNet} />
        </section>
        <PeriodPanel periods={periods} cur={cur} useNet={useNet} />
      </div>

      <Exceptions filter={filter} />
    </div>
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

function PeriodPanel({
  periods,
  cur,
  useNet,
}: {
  periods: Awaited<ReturnType<typeof getPeriodTotals>>;
  cur: string;
  useNet: boolean;
}) {
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

// Výjimky: pobočky s největším poklesem tržeb vs srovnávací období.
async function Exceptions({ filter }: { filter: PosFilter }) {
  if (!isPosApiConfigured() || filter.comparison === "zadne") return null;
  let rows: Awaited<ReturnType<typeof getShopLeaderboardFull>>;
  let shopsRaw: Awaited<ReturnType<typeof getAllShops>>;
  try {
    [rows, shopsRaw] = await Promise.all([getShopLeaderboardFull(filter), getAllShops()]);
  } catch {
    return null;
  }
  const useNet = !filter.vatInclusive;
  const shopName = new Map(shopsRaw.map((s) => [s.id, s.name]));
  const decliners = rows
    .map((r) => {
      const value = useNet ? r.net : r.gross;
      const prev = useNet ? r.prevNet : r.prevGross;
      const delta = prev != null && prev > 0 ? (value - prev) / prev : null;
      return { id: r.shop_id, name: shopName.get(r.shop_id) ?? r.shop_id, value, prev, delta };
    })
    .filter((d) => d.delta != null && d.delta <= -0.15 && (d.prev ?? 0) >= 1000)
    .sort((a, b) => (a.delta as number) - (b.delta as number))
    .slice(0, 8);

  if (decliners.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
        Výjimky - největší pokles vs {COMPARISON_LABEL[filter.comparison].toLowerCase()}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
        {decliners.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 border-b border-edge/60 px-4 py-2.5 text-[13px] last:border-0"
          >
            <span className="min-w-0 flex-1 truncate text-ink-base">{d.name}</span>
            <span className="tabular-nums text-ink-mid">{formatPosMoney(d.value, filter.currency)}</span>
            <PosDeltaBadge current={d.value} previous={d.prev} goodDir="up" className="w-[68px] justify-end text-[11.5px]" />
          </div>
        ))}
      </div>
    </section>
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
