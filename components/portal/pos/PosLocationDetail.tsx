import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { comparisonLabel, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import {
  getAllShops,
  getDailyTrend,
  getDaypart,
  getHeatmap,
  getKpiSummary,
  getPaymentMix,
  getReceiptsPage,
  getTopProducts,
  getVatSplit,
  resolveDisplayCurrency,
} from "@/lib/portal/pos/queries";
import { cachedListLocations } from "@/lib/portal/cached-db";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import type { Daypart, DayPoint, SummaryRow } from "@/lib/portal/pos/types";
import { BTN_OUTLINE } from "@/components/portal/ui/buttons";
import { PosKpiCard } from "./PosKpiCard";
import { PosLineChart } from "./PosLineChart";
import { PosHeatmap } from "./PosHeatmap";
import { PosBars, type BarRow } from "./PosBars";
import { PosDeltaBadge } from "./PosDeltaBadge";
import { ReceiptsTable } from "./ReceiptsTable";
import { BarsRowSkeleton, ChartSkeleton, KpiStripSkeleton, LeaderboardSkeleton } from "./skeletons";
import {
  DAYPART_LABEL,
  formatPosMoney,
  formatPosMoneyCompact,
  formatPosNumber,
  formatPct,
  normalizeVatRate,
  signedMoneyCompact,
  signedNumber,
} from "./pos-shared";

// Obsah detailu prodejny pro stránku prodejny/[locationId]. Detail = výběr
// zúžený na jednu lokalitu (rollup jejích pokladen). Sekce streamují nezávisle
// pod <Suspense>; heatmapa (drahý DW scan) má vlastní boundary.

const DP_ORDER: Daypart[] = ["rano", "dopoledne", "poledne", "odpoledne", "vecer", "noc"];

function fmtDayLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

const CZ_MONTHS_SHORT = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];
function fmtMonthLabel(date: string, withYear: boolean): string {
  const [y, m] = date.split("-");
  const name = CZ_MONTHS_SHORT[Number(m) - 1] ?? m;
  return withYear ? `${name} ${y.slice(2)}` : name;
}

// Popisek bodu/řádku trendu dle granularity (den vs měsíc); rok u měsíců jen při víceletém okně.
function trendLabeler(grain: "day" | "month", points: { date: string }[]): (date: string) => string {
  if (grain !== "month") return (date) => fmtDayLabel(date);
  const multiYear = new Set(points.map((p) => p.date.slice(0, 4))).size > 1;
  return (date) => fmtMonthLabel(date, multiYear);
}
function pickRow(rows: SummaryRow[] | null, currency: string): SummaryRow | null {
  return rows?.find((r) => r.currency === currency) ?? null;
}

export interface PosLocationMeta {
  name: string;
  cur: string;
  filter: PosFilter;
  useNet: boolean;
}

// Název prodejny + efektivní měna (cheap, cachované číselníky). Měna padá na
// měnu, ve které pokladny prodejny účtují (cizoměnová prodejna -> její měna).
// Výběr ve filtru zúžen na jednu lokalitu.
export async function resolvePosLocationMeta(locationId: string, baseFilter: PosFilter): Promise<PosLocationMeta> {
  // Detail jedné lokality: vždy celá síť (jinak by BOS okruh ne-BOS prodejnu vynuloval).
  const filter: PosFilter = { ...baseFilter, scope: "all", selection: { concepts: [], locations: [locationId] } };
  let name = "Prodejna";
  let cur = filter.currency;
  try {
    if (locationId.startsWith("shop:")) {
      const shops = await getAllShops();
      name = shops.find((s) => s.id === locationId.slice(5))?.name ?? "Pokladna";
    } else {
      const locs = await cachedListLocations();
      name = locs.find((l) => l.id === locationId)?.name ?? "Prodejna";
    }
    cur = await resolveDisplayCurrency(filter);
  } catch {
    /* fallback name + měna */
  }
  return { name, cur, filter, useNet: !filter.vatInclusive };
}

// Tělo detailu (bez hlavičky - tu si dodá stránka/modal sama). Hlídá konfiguraci.
export function PosLocationDetailBody({ filter, cur, useNet }: { filter: PosFilter; cur: string; useNet: boolean }) {
  if (!isPosApiConfigured()) {
    return <Notice title="POS data nejsou nakonfigurovaná" body="Nastavte POS_API_BASE a POS_API_KEY (Vercel)." />;
  }
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="flex flex-col gap-6"><KpiStripSkeleton /><ChartSkeleton height={240} /></div>}>
        <DetailHeader filter={filter} cur={cur} useNet={useNet} />
      </Suspense>

      <section className="flex flex-col gap-3">
        <H2>Po dnech</H2>
        <Suspense fallback={<ChartSkeleton height={300} />}>
          <DailyBreakdownSection filter={filter} cur={cur} />
        </Suspense>
      </section>

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

      <Suspense fallback={<LeaderboardSkeleton rows={8} />}>
        <ReceiptsSection filter={filter} useNet={useNet} />
      </Suspense>
    </div>
  );
}

async function DetailHeader({ filter, cur, useNet }: { filter: PosFilter; cur: string; useNet: boolean }) {
  let kpi: Awaited<ReturnType<typeof getKpiSummary>>;
  let trend: Awaited<ReturnType<typeof getDailyTrend>>;
  try {
    [kpi, trend] = await Promise.all([getKpiSummary(filter), getDailyTrend(filter)]);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst data prodejny." />;
  }
  const c = pickRow(kpi.current, cur);
  const p = pickRow(kpi.comparison, cur);
  const days = trend.current;
  const sparkRevenue = days.map((d) => (useNet ? d.net : d.gross));
  const sparkReceipts = days.map((d) => d.receipts);
  const sparkAtv = days.map((d) => (d.receipts > 0 ? d.gross / d.receipts : 0));
  const revenue = c ? (useNet ? c.net : c.gross) : 0;
  const prevRevenue = useNet ? p?.net : p?.gross;

  return (
    <div className="flex flex-col gap-6">
      {c ? (
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
        </div>
      ) : (
        <Notice title={`Pro ${cur} nejsou v tomto období data`} body="Zkuste jinou měnu nebo se vraťte na žebříček." />
      )}

      <section className="flex flex-col gap-3">
        <H2>Vývoj tržeb ({useNet ? "bez DPH" : "s DPH"})</H2>
        <Trend trend={trend} cur={cur} filter={filter} useNet={useNet} />
      </section>
    </div>
  );
}

// Tabulka tržeb po jednotlivých dnech období: 1 řádek = 1 den, tržby bez/s DPH,
// účtenky + srovnání se stejně dlouhým předchozím obdobím (např. D-28), zarovnané
// po indexu (den i vs den i v předchozím okně).
async function DailyBreakdownSection({ filter, cur }: { filter: PosFilter; cur: string }) {
  let trend: Awaited<ReturnType<typeof getDailyTrend>>;
  try {
    trend = await getDailyTrend(filter);
  } catch {
    return <WidgetError />;
  }
  if (trend.current.length === 0) {
    return (
      <div className="grid h-[120px] place-items-center rounded-2xl border border-edge bg-paper text-[13px] text-ink-mid">
        Pro zvolené období nejsou data.
      </div>
    );
  }
  const cmp = trend.comparison;
  const labelOf = trendLabeler(trend.grain, trend.current);
  const rows = trend.current.map((d, i) => ({ d, prev: cmp ? cmp[i] : undefined })).reverse();
  return (
    <div className="overflow-x-auto rounded-2xl border border-edge bg-paper">
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-edge text-left text-[11px] uppercase tracking-[0.1em] text-ink-mid">
            <th className="px-4 py-2.5 font-medium">{trend.grain === "month" ? "Měsíc" : "Den"}</th>
            <th className="px-4 py-2.5 text-right font-medium">Účtenky</th>
            <th className="px-4 py-2.5 text-right font-medium">Tržby bez DPH</th>
            <th className="px-4 py-2.5 text-right font-medium">Tržby s DPH</th>
            <th className="px-4 py-2.5 text-right font-medium">vs předchozí</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, prev }) => (
            <tr key={d.date} className="border-b border-edge/60 last:border-0">
              <td className="px-4 py-2.5 tabular-nums text-ink-base">{labelOf(d.date)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-mid">{formatPosNumber(d.receipts)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-deep">{formatPosMoney(d.net, cur)}</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-base">{formatPosMoney(d.gross, cur)}</td>
              <td className="px-4 py-2.5">
                <PosDeltaBadge current={d.gross} previous={prev?.gross ?? null} className="justify-end text-[11px]" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

// Posledních 50 účtenek prodejny (úplně dole). Sdílí seznam i modal s detailem
// se stránkou /uctenky; řádek lze rozkliknout do detailu. Tlačítko "Zobrazit
// všechny" vede na týž seznam zúžený na tuto prodejnu (filter nese l=<locationId>
// i období/měnu), kde lze stránkovat a dál filtrovat.
async function ReceiptsSection({ filter, useNet }: { filter: PosFilter; useNet: boolean }) {
  let data: Awaited<ReturnType<typeof getReceiptsPage>>;
  try {
    data = await getReceiptsPage(filter, 0, { limit: 50 });
  } catch {
    return null;
  }
  const rows = data.data;
  if (rows.length === 0) return null;
  const total = data.meta.total;
  const qs = serializePosFilter(filter).toString();
  const allHref = qs ? `/portal/pos/uctenky?${qs}` : "/portal/pos/uctenky";
  const hasMore = total > rows.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <H2>Účtenky</H2>
        <span className="text-[12px] tabular-nums text-ink-soft">
          {hasMore ? `Posledních ${rows.length} z ${formatPosNumber(total)}` : `${formatPosNumber(total)} celkem`}
        </span>
      </div>

      <ReceiptsTable rows={rows} useNet={useNet} filterQs={qs} hideLocation />

      <div className="flex justify-center pt-1">
        <Link href={allHref} className={BTN_OUTLINE}>
          {hasMore ? "Zobrazit všechny účtenky" : "Filtrovat účtenky"}
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function Trend({
  trend,
  cur,
  filter,
  useNet,
}: {
  trend: Awaited<ReturnType<typeof getDailyTrend>>;
  cur: string;
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
  const labelOf = trendLabeler(trend.grain, trend.current);
  const current = trend.current.map((d) => ({ label: labelOf(d.date), value: pick(d) }));
  const comparison = trend.comparison ? trend.comparison.map(pick) : null;
  return (
    <PosLineChart
      current={current}
      comparison={comparison}
      currency={cur}
      comparisonLabel={comparisonLabel(filter)}
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
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-edge bg-paper p-6">
      <div className="text-[14px] font-semibold text-ink-base">{title}</div>
      <p className="mt-1.5 max-w-[60ch] text-[13px] text-ink-mid">{body}</p>
    </div>
  );
}
