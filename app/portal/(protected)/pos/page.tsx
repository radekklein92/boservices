import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { COMPARISON_LABEL, parsePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import { getDailyTrend, getKpiSummary } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import type { SummaryRow } from "@/lib/portal/pos/types";
import { PosKpiCard } from "@/components/portal/pos/PosKpiCard";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
import { formatPosMoney, formatPosNumber, formatPct } from "@/components/portal/pos/pos-shared";

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

  return (
    <div className="flex flex-col gap-8">
      <Kpis filter={filter} />
      <Trend filter={filter} />
    </div>
  );
}

async function Kpis({ filter }: { filter: PosFilter }) {
  if (!isPosApiConfigured()) {
    return (
      <Notice
        title="POS data nejsou nakonfigurovaná"
        body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel) - dashboard pak začne číst z API Data Warehouse."
      />
    );
  }

  let data: { current: SummaryRow[]; comparison: SummaryRow[] | null };
  try {
    data = await getKpiSummary(filter);
  } catch {
    return (
      <Notice
        title="Data dočasně nedostupná"
        body="Nepodařilo se načíst data z API Data Warehouse. Zkuste to za chvíli - poslední známá data se zobrazí po obnovení."
      />
    );
  }

  const cur = filter.currency;
  const c = pickRow(data.current, cur);
  const p = pickRow(data.comparison, cur);

  if (!c) {
    return (
      <Notice
        title={`Pro ${cur} nejsou v tomto období data`}
        body="Zkuste jiné období nebo měnu ve filtru nahoře."
      />
    );
  }

  const useNet = !filter.vatInclusive;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <PosKpiCard
        label={useNet ? "Čisté tržby" : "Tržby (s DPH)"}
        value={formatPosMoney(useNet ? c.net : c.gross, cur)}
        current={useNet ? c.net : c.gross}
        previous={(useNet ? p?.net : p?.gross) ?? null}
      />
      <PosKpiCard
        label={useNet ? "Hrubé tržby" : "Čistá báze"}
        value={formatPosMoney(useNet ? c.gross : c.net, cur)}
        current={useNet ? c.gross : c.net}
        previous={(useNet ? p?.gross : p?.net) ?? null}
      />
      <PosKpiCard
        label="Účtenky"
        value={formatPosNumber(c.receipts)}
        current={c.receipts}
        previous={p?.receipts ?? null}
      />
      <PosKpiCard
        label="Průměrná útrata"
        value={c.avg_ticket != null ? formatPosMoney(c.avg_ticket, cur) : "—"}
        current={c.avg_ticket ?? undefined}
        previous={p?.avg_ticket ?? null}
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
        value={formatPosMoney(c.vat, cur)}
        current={c.vat}
        previous={p?.vat ?? null}
      />
    </div>
  );
}

async function Trend({ filter }: { filter: PosFilter }) {
  if (!isPosApiConfigured()) return null;
  let trend: Awaited<ReturnType<typeof getDailyTrend>>;
  try {
    trend = await getDailyTrend(filter);
  } catch {
    return null;
  }
  if (trend.current.length === 0) return null;
  const useNet = !filter.vatInclusive;
  const current = trend.current.map((d) => ({ label: fmtDayLabel(d.date), value: useNet ? d.net : d.gross }));
  const comparison = trend.comparison
    ? trend.comparison.map((d) => (useNet ? d.net : d.gross))
    : null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
        Vývoj tržeb ({useNet ? "čisté" : "s DPH"})
      </h2>
      <PosLineChart
        current={current}
        comparison={comparison}
        currency={filter.currency}
        comparisonLabel={COMPARISON_LABEL[filter.comparison]}
      />
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
