import { Suspense } from "react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { parsePosFilter, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import { getHeatmap, getLiveMovers, getToday, resolveDisplayCurrency } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { PosSubNav } from "@/components/portal/pos/PosSubNav";
import { PosKpiCard } from "@/components/portal/pos/PosKpiCard";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
import { LiveMoversPanel } from "@/components/portal/pos/LiveMoversPanel";
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
  // Vše spustíme naráz, ale selhání oddělíme. getToday (dnešní tržby) je jádro
  // stránky. Graf po hodinách (heatmapa "dnes") a hybatelé + srovnání KPI
  // (getLiveMovers - těžká 30denní heatmapa, na studené cache občas timeoutuje)
  // jsou doplňky: jejich pád NESMÍ shodit dnešní KPI, proto degradují na null.
  const heatP = getHeatmap(todayFilter).catch(() => null);
  const moversP = getLiveMovers(filter).catch(() => null);
  let today: Awaited<ReturnType<typeof getToday>>;
  let cur: string;
  try {
    [today, cur] = await Promise.all([getToday(filter), resolveDisplayCurrency(filter)]);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst dnešní data z API Data Warehouse." />;
  }
  const heat = await heatP;
  const movers = await moversP;

  const t = today.find((r) => r.currency === cur) ?? null;
  const byHour = new Map<number, { gross: number; net: number }>();
  for (const c of heat ?? []) {
    const a = byHour.get(c.hour) ?? { gross: 0, net: 0 };
    a.gross += c.gross;
    a.net += c.net;
    byHour.set(c.hour, a);
  }
  const hours = [...byHour.entries()].sort((a, b) => a[0] - b[0]);
  const current = hours.map(([h, v]) => ({ label: `${h}`, value: useNet ? v.net : v.gross }));
  const spark = current.map((c) => c.value);
  const atv = t && t.receipts > 0 ? t.gross / t.receipts : null;

  // Srovnání KPI vs stejný den minulý týden "k této hodině": baseline (celý den) ×
  // frakce dne uplynulá do teď. Průměrný ticket je poměr -> frakce se vykrátí
  // (porovnává se s celodenním ticketem minulého týdne). Když hybatelé selžou
  // (movers == null po timeoutu), KPI se zobrazí bez srovnání.
  const f = movers?.dayFraction ?? null;
  const base = movers?.baseline ?? null;
  const todayRevenue = t ? (useNet ? t.net : t.gross) : 0;
  const baseRevenue = base ? (useNet ? base.net : base.gross) : 0;
  const expectedRevenue = base && f != null && baseRevenue > 0 ? baseRevenue * f : null;
  const expectedReceipts = base && f != null && base.receipts > 0 ? base.receipts * f : null;
  const baseAtv = base && base.receipts > 0 ? base.gross / base.receipts : null;

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
            value={formatPosMoneyCompact(todayRevenue, cur)}
            valueTitle={formatPosMoney(todayRevenue, cur)}
            current={todayRevenue}
            previous={expectedRevenue}
            spark={spark}
            emphasis
          />
          <PosKpiCard
            label="Účtenky"
            value={formatPosNumber(t.receipts)}
            current={t.receipts}
            previous={expectedReceipts}
          />
          <PosKpiCard
            label="Průměrný ticket"
            value={atv != null ? formatPosMoney(atv, cur) : "—"}
            current={atv ?? undefined}
            previous={baseAtv}
          />
        </div>
      )}

      {current.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
            Dnešní vývoj po hodinách ({useNet ? "bez DPH" : "s DPH"})
          </h2>
          <PosLineChart current={current} currency={cur} height={240} />
        </section>
      )}

      {movers && movers.best.length + movers.worst.length >= 2 && <LiveMoversPanel movers={movers} />}
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
