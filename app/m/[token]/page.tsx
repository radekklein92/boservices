import { Suspense } from "react";
import { cookies } from "next/headers";
import type { Metadata, Viewport } from "next";
import { DEFAULT_POS_FILTER, isAllSelection, type PosFilter, type PosSelection } from "@/lib/portal/pos/filters";
import { getMobileLink, isUnlocked, MLINK_COOKIE } from "@/lib/portal/pos/mobile-link-db";
import { getClosedStores, getHeatmap, getLiveMovers, getLongClosedBosStores, getToday, resolveDisplayCurrency } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { CONCEPT_LABEL } from "@/components/portal/locations/locations-shared";
import { PosKpiCard } from "@/components/portal/pos/PosKpiCard";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
import { LiveMoversPanel } from "@/components/portal/pos/LiveMoversPanel";
import { ClosedStoresKpiCard } from "@/components/portal/pos/ClosedStoresPanel";
import { PosAutoRefresh } from "@/components/portal/pos/PosAutoRefresh";
import { MobilePinGate } from "@/components/portal/pos/MobilePinGate";
import { ChartSkeleton, KpiCardSkeleton, KpiStripSkeleton } from "@/components/portal/pos/skeletons";
import { formatPosMoney, formatPosMoneyCompact, formatPosNumber } from "@/components/portal/pos/pos-shared";

// Veřejný osobní "Živě" dashboard (mobilní). Chráněn jen tajným tokenem v cestě + PINem
// (cookie). Bez session - běží server-side, takže POS klíč zůstává na serveru. Vždy
// "dnes"; obnova á 60 s. Přidatelný na plochu telefonu (apple-icon.png z app/).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tržby dnes",
  // Standalone režim po "Přidat na plochu" (iOS); ikonu bere z app/apple-icon.png.
  appleWebApp: { capable: true, title: "Tržby", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
};

// Lidský popis výběru do hlavičky (bez tahání mapování id→název prodejny).
function describeSelection(selection: PosSelection, scope: PosFilter["scope"]): string {
  if (isAllSelection(selection)) return scope === "bos" ? "BOS prodejny" : "Celá síť";
  const parts: string[] = selection.concepts.map((c) => CONCEPT_LABEL[c] ?? c);
  if (selection.locations.length > 0) {
    const n = selection.locations.length;
    parts.push(`${n} ${n === 1 ? "prodejna" : n < 5 ? "prodejny" : "prodejen"}`);
  }
  return parts.join(" · ") || "Vybrané prodejny";
}

export default async function MobileDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await getMobileLink(token);
  if (!link) {
    return <MobileNotice title="Odkaz neplatí" body="Tento odkaz už není aktivní. Požádejte o nový." />;
  }

  const jar = await cookies();
  if (!isUnlocked(link, jar.get(MLINK_COOKIE(token))?.value)) {
    return <MobilePinGate token={token} />;
  }

  const filter: PosFilter = {
    ...DEFAULT_POS_FILTER,
    selection: link.selection,
    scope: link.scope,
    preset: "dnes",
    currency: link.currency,
    vatInclusive: link.vatInclusive,
  };
  const title = describeSelection(link.selection, link.scope);

  return (
    <main className="mx-auto w-full max-w-[560px] px-4 py-5 sm:py-7">
      <PosAutoRefresh seconds={60} />
      {!isPosApiConfigured() ? (
        <MobileNotice title="POS data nejsou dostupná" body="Zkuste to prosím později." />
      ) : (
        <Suspense
          fallback={
            <div className="flex flex-col gap-5">
              <Header title={title} asOf="" />
              <KpiStripSkeleton cards={3} />
              <ChartSkeleton height={200} />
            </div>
          }
        >
          <MobileLiveContent filter={filter} title={title} />
        </Suspense>
      )}
    </main>
  );
}

async function MobileLiveContent({ filter, title }: { filter: PosFilter; title: string }) {
  const useNet = !filter.vatInclusive;
  // getToday je jádro; graf (heatmapa) a hybatelé degradují na null (nesmí shodit KPI).
  const heatP = getHeatmap(filter).catch(() => null);
  const moversP = getLiveMovers(filter).catch(() => null);
  let today: Awaited<ReturnType<typeof getToday>>;
  let cur: string;
  try {
    [today, cur] = await Promise.all([getToday(filter), resolveDisplayCurrency(filter)]);
  } catch {
    return (
      <div className="flex flex-col gap-5">
        <Header title={title} asOf="" />
        <MobileNotice title="Data dočasně nedostupná" body="Nepodařilo se načíst dnešní tržby." />
      </div>
    );
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

  // Srovnání KPI vs stejný den minulý týden "k této hodině" (baseline × frakce dne).
  const f = movers?.dayFraction ?? null;
  const base = movers?.baseline ?? null;
  const todayRevenue = t ? (useNet ? t.net : t.gross) : 0;
  const baseRevenue = base ? (useNet ? base.net : base.gross) : 0;
  const expectedRevenue = base && f != null && baseRevenue > 0 ? baseRevenue * f : null;
  const expectedReceipts = base && f != null && base.receipts > 0 ? base.receipts * f : null;
  const baseAtv = base && base.receipts > 0 ? base.gross / base.receipts : null;

  const asOfRaw = t?.as_of ? new Date(t.as_of) : null;
  const asOf =
    asOfRaw && !Number.isNaN(asOfRaw.getTime())
      ? new Intl.DateTimeFormat("cs-CZ", {
          timeZone: "Europe/Prague",
          day: "numeric",
          month: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(asOfRaw)
      : "";

  return (
    <div className="flex flex-col gap-5">
      <Header title={title} asOf={asOf} />

      {!t ? (
        <MobileNotice title={`Pro ${cur} dnes zatím nejsou data`} body="Zkuste to později." />
      ) : (
        <div className="flex flex-col gap-3">
          <PosKpiCard
            label={`Dnešní tržby (${useNet ? "bez DPH" : "s DPH"})`}
            value={formatPosMoneyCompact(todayRevenue, cur)}
            valueTitle={formatPosMoney(todayRevenue, cur)}
            current={todayRevenue}
            previous={expectedRevenue}
            spark={spark}
            emphasis
          />
          <div className="grid grid-cols-2 gap-3">
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
          {/* Neotevřené prodejny - vlastní Suspense, ať ~týdenní okno nezdrží dnešní KPI. */}
          <Suspense fallback={<KpiCardSkeleton />}>
            <MobileClosedCell filter={filter} />
          </Suspense>
        </div>
      )}

      {current.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
            Dnešní vývoj po hodinách ({useNet ? "bez DPH" : "s DPH"})
          </h2>
          <PosLineChart current={current} currency={cur} height={200} />
        </section>
      )}

      {movers && movers.best.length + movers.worst.length >= 2 && <LiveMoversPanel movers={movers} />}
    </div>
  );
}

// Report neotevřených prodejen na mobilu (klik = modal). Vlastní Suspense boundary;
// při chybě tiše vypadne (zbytek dashboardu běží dál).
async function MobileClosedCell({ filter }: { filter: PosFilter }) {
  let report: Awaited<ReturnType<typeof getClosedStores>>;
  // Dlouhodobě neotevřené (VŽDY okruh BOS) běží paralelně; pád jen schová tlačítko.
  let longReport: Awaited<ReturnType<typeof getLongClosedBosStores>> | null;
  try {
    [report, longReport] = await Promise.all([
      getClosedStores(filter),
      getLongClosedBosStores(filter.currency).catch(() => null),
    ]);
  } catch {
    return null;
  }
  return <ClosedStoresKpiCard report={report} longReport={longReport} />;
}

function Header({ title, asOf }: { title: string; asOf: string }) {
  return (
    <header className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[12px] text-ink-mid">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Dnes průběžně{asOf ? ` · ${asOf}` : ""}
      </div>
      <h1 className="text-[1.35rem] font-extrabold tracking-[-0.02em] text-ink-base">{title}</h1>
    </header>
  );
}

function MobileNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-edge bg-paper p-6 text-center">
      <div className="text-[15px] font-semibold text-ink-base">{title}</div>
      <p className="mx-auto mt-1.5 max-w-[40ch] text-[13px] text-ink-mid">{body}</p>
    </div>
  );
}
