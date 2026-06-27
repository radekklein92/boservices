import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { DEFAULT_POS_FILTER, COMPARISON_LABEL, DATE_PRESET_LABEL, parsePosFilter } from "@/lib/portal/pos/filters";
import { getKpiSummary, getDailyTrend } from "@/lib/portal/pos/queries";
import { getLastSyncCached } from "@/lib/portal/pos/cache";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import type { SummaryRow } from "@/lib/portal/pos/types";
import { PosKpiCard } from "@/components/portal/pos/PosKpiCard";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
import { formatPosMoney, formatPosNumber, formatPct } from "@/components/portal/pos/pos-shared";

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

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokladna - Přehled" };

// Pozn.: zatím pevný filtr (DEFAULT_POS_FILTER = tento týden vs předchozí rok, CZK).
// Interaktivní PosFilterBar + grafy (trend, heatmapa) + leaderboard jsou další krok.

function pickRow(rows: SummaryRow[] | null, currency: string): SummaryRow | null {
  return rows?.find((r) => r.currency === currency) ?? null;
}

function formatSyncTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
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

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink-base">
            Tržby
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-mid">
            {DATE_PRESET_LABEL[filter.preset]} · {COMPARISON_LABEL[filter.comparison].toLowerCase()} · {cur}
          </p>
        </div>
        <SyncBadge />
      </header>

      <Kpis filter={filter} />
      <Trend filter={filter} />
    </div>
  );
}

async function Trend({ filter }: { filter: typeof DEFAULT_POS_FILTER }) {
  if (!isPosApiConfigured()) return null;
  let trend: Awaited<ReturnType<typeof getDailyTrend>>;
  try {
    trend = await getDailyTrend(filter);
  } catch {
    return null;
  }
  if (trend.current.length === 0) return null;
  const current = trend.current.map((d) => ({ label: fmtDayLabel(d.date), value: d.net }));
  const comparison = trend.comparison ? trend.comparison.map((d) => d.net) : null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
        Vývoj čistých tržeb
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

async function SyncBadge() {
  if (!isPosApiConfigured()) return null;
  let when: string | null = null;
  try {
    const s = await getLastSyncCached();
    when = formatSyncTime(s?.last_successful_run_at);
  } catch {
    when = null;
  }
  if (!when) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-edge bg-paper px-3 py-1.5 text-[11.5px] text-ink-mid">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      Aktualizováno {when}
    </div>
  );
}

async function Kpis({ filter }: { filter: typeof DEFAULT_POS_FILTER }) {
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
        body="Zkuste jiné období nebo měnu (filtr přibude v dalším kroku)."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <PosKpiCard
        label="Čisté tržby"
        value={formatPosMoney(c.net, cur)}
        current={c.net}
        previous={p?.net ?? null}
      />
      <PosKpiCard
        label="Hrubé tržby"
        value={formatPosMoney(c.gross, cur)}
        current={c.gross}
        previous={p?.gross ?? null}
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

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-edge bg-paper p-6">
      <div className="text-[14px] font-semibold text-ink-base">{title}</div>
      <p className="mt-1.5 max-w-[60ch] text-[13px] text-ink-mid">{body}</p>
    </div>
  );
}
