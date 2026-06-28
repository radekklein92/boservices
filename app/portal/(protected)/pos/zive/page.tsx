import { Suspense } from "react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { parsePosFilter, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import { getHeatmap, getLiveMovers, getToday, resolveDisplayCurrency } from "@/lib/portal/pos/queries";
import type { LiveMoverRow } from "@/lib/portal/pos/types";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { PosSubNav } from "@/components/portal/pos/PosSubNav";
import { PosKpiCard } from "@/components/portal/pos/PosKpiCard";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
import { PosDeltaBadge } from "@/components/portal/pos/PosDeltaBadge";
import { PosAutoRefresh } from "@/components/portal/pos/PosAutoRefresh";
import { PosFilterBarLoader } from "@/components/portal/pos/PosFilterBarLoader";
import { ChartSkeleton, FilterBarSkeleton, KpiStripSkeleton } from "@/components/portal/pos/skeletons";
import { formatLocalDateTime, formatPosMoney, formatPosMoneyCompact, formatPosNumber } from "@/components/portal/pos/pos-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tržby - Živě" };

function searchParamsToUsp(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") usp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") usp.set(k, v[0]);
  }
  return usp;
}

export default async function PosLivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const filter = parsePosFilter(searchParamsToUsp(await searchParams));
  const backQs = serializePosFilter(filter).toString();

  return (
    <>
      <PosAutoRefresh seconds={90} />
      <PageHeader
        eyebrow="Provoz"
        title="Živě"
        lede="Dnešní průběžné tržby - obnova á 90 s."
      />
      <PosSubNav />

      <Suspense fallback={<FilterBarSkeleton />}>
        <PosFilterBarLoader filter={filter} />
      </Suspense>
      {!isPosApiConfigured() ? (
        <Notice title="POS data nejsou nakonfigurovaná" body="Nastavte POS_API_BASE a POS_API_KEY (Vercel)." />
      ) : (
        <Suspense fallback={<div className="flex flex-col gap-6"><KpiStripSkeleton cards={3} /><ChartSkeleton height={240} /></div>}>
          <LiveContent filter={filter} />
        </Suspense>
      )}
    </>
  );
}

async function LiveContent({ filter }: { filter: PosFilter }) {
  const useNet = !filter.vatInclusive;
  const todayFilter: PosFilter = { ...filter, preset: "dnes" };
  let today: Awaited<ReturnType<typeof getToday>>;
  let heat: Awaited<ReturnType<typeof getHeatmap>>;
  let movers: Awaited<ReturnType<typeof getLiveMovers>>;
  let cur: string;
  try {
    [today, heat, movers, cur] = await Promise.all([
      getToday(filter),
      getHeatmap(todayFilter),
      getLiveMovers(filter),
      resolveDisplayCurrency(filter),
    ]);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst dnešní data z API Data Warehouse." />;
  }

  const t = today.find((r) => r.currency === cur) ?? null;
  const byHour = new Map<number, { gross: number; net: number }>();
  for (const c of heat) {
    const a = byHour.get(c.hour) ?? { gross: 0, net: 0 };
    a.gross += c.gross;
    a.net += c.net;
    byHour.set(c.hour, a);
  }
  const hours = [...byHour.entries()].sort((a, b) => a[0] - b[0]);
  const current = hours.map(([h, v]) => ({ label: `${h}`, value: useNet ? v.net : v.gross }));
  const spark = current.map((c) => c.value);
  const atv = t && t.receipts > 0 ? t.gross / t.receipts : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-mid">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Dnes průběžně{t?.as_of ? ` · poslední doklad ${formatLocalDateTime(t.as_of)}` : ""}
      </div>

      {!t ? (
        <Notice title={`Pro ${cur} dnes zatím nejsou data`} body="Zkuste jinou měnu nebo se vraťte později." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PosKpiCard
            label={`Dnešní tržby (${useNet ? "bez DPH" : "s DPH"})`}
            value={formatPosMoneyCompact(useNet ? t.net : t.gross, cur)}
            valueTitle={formatPosMoney(useNet ? t.net : t.gross, cur)}
            spark={spark}
            emphasis
          />
          <PosKpiCard label="Účtenky" value={formatPosNumber(t.receipts)} />
          <PosKpiCard label="Průměrný ticket" value={atv != null ? formatPosMoney(atv, cur) : "—"} />
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
          Dnešní vývoj po hodinách ({useNet ? "bez DPH" : "s DPH"})
        </h2>
        <PosLineChart current={current} currency={cur} height={240} />
      </section>

      {movers.best.length + movers.worst.length >= 2 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
              Hybatelé dne
            </h2>
            <span className="text-[11.5px] text-ink-soft">
              dnes zatím vs tempo včerejška k této hodině ({Math.round(movers.dayFraction * 100)} % dne)
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MoversCard title="Nejlepší prodejny" tone="up" rows={movers.best} currency={movers.currency} />
            <MoversCard title="Největší pokles" tone="down" rows={movers.worst} currency={movers.currency} />
          </div>
        </section>
      )}
    </div>
  );
}

function MoversCard({
  title,
  tone,
  rows,
  currency,
}: {
  title: string;
  tone: "up" | "down";
  rows: LiveMoverRow[];
  currency: string;
}) {
  const dot = tone === "up" ? "bg-emerald-500" : "bg-rose-500";
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-edge bg-paper p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        <h3 className="text-[13px] font-semibold text-ink-base">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-[12.5px] text-ink-soft">Zatím žádná prodejna v tomto pásmu.</p>
      ) : (
        <ol className="flex flex-col">
          {rows.map((r, i) => (
            <li
              key={r.locationId}
              className="flex items-center gap-3 border-b border-edge/60 py-2 last:border-0"
            >
              <span className="w-4 shrink-0 text-right text-[11.5px] tabular-nums text-ink-soft">{i + 1}</span>
              <span className="flex-1 truncate text-[13px] text-ink-deep" title={r.name}>
                {r.name}
              </span>
              <span
                className="shrink-0 text-right text-[12.5px] tabular-nums text-ink-mid"
                title={formatPosMoney(r.todaySoFar, currency)}
              >
                {formatPosMoneyCompact(r.todaySoFar, currency)}
              </span>
              <PosDeltaBadge
                current={r.todaySoFar}
                previous={r.expectedByNow}
                className="w-16 shrink-0 justify-end text-[11.5px]"
              />
            </li>
          ))}
        </ol>
      )}
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
