import { Suspense } from "react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { parsePosFilter, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import { getHeatmap, getToday } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { PosSubNav } from "@/components/portal/pos/PosSubNav";
import { PosKpiCard } from "@/components/portal/pos/PosKpiCard";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
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
      <Suspense fallback={<FilterBarSkeleton />}>
        <PosFilterBarLoader />
      </Suspense>

      <PosSubNav />
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
  const cur = filter.currency;
  const useNet = !filter.vatInclusive;
  const todayFilter: PosFilter = { ...filter, preset: "dnes" };
  let today: Awaited<ReturnType<typeof getToday>>;
  let heat: Awaited<ReturnType<typeof getHeatmap>>;
  try {
    [today, heat] = await Promise.all([getToday(filter), getHeatmap(todayFilter)]);
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
