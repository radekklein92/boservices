import Link from "next/link";
import { ArrowUpRight, LineChart } from "lucide-react";
import { PosLineChart } from "@/components/portal/pos/PosLineChart";
import { PosDeltaBadge } from "@/components/portal/pos/PosDeltaBadge";
import { formatPosMoneyCompact } from "@/components/portal/pos/pos-shared";
import type { BosDashboardRevenue } from "@/lib/portal/pos/queries";

function fmtDayLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

// Graf týdenních tržeb (jen BOS prodejny) pod kartou Real Estate na dashboardu.
// Denní sloupce (emerald gradient) + srovnávací linka minulého týdne. Chrome
// identický s ReTrendCard. "Detail" otevře sekci Tržby.
export function RevenueWeekCard({ data }: { data: BosDashboardRevenue }) {
  const current = data.daily.map((d) => ({ label: fmtDayLabel(d.date), value: d.gross }));
  const prevTotal = data.comparison.reduce((a, b) => a + b, 0);

  return (
    <section className="rounded-3xl border border-edge bg-paper p-6 sm:p-7">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          <span
            aria-hidden="true"
            className="mr-3 inline-block h-px w-6 translate-y-[-3px] bg-ink-base/50 align-middle"
          />
          Tržby za poslední týden
        </div>
        <Link
          href="/portal/pos"
          className="group inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
        >
          <LineChart className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Detail
          <ArrowUpRight
            className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            strokeWidth={1.5}
          />
        </Link>
      </div>

      {/* Legenda: tento vs minulý týden (po vzoru RE legendy) */}
      <div className="mb-5 flex flex-wrap items-center gap-x-7 gap-y-2 text-[13px]">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
          <span className="text-ink-mid">Tento týden</span>
          <span className="font-bold tabular-nums text-ink-base">
            {formatPosMoneyCompact(data.headlineGross, data.currency)}
          </span>
          {data.lflCurrentGross != null && (
            <PosDeltaBadge
              current={data.lflCurrentGross}
              previous={data.lflPreviousGross}
              goodDir="up"
              className="text-[12px]"
            />
          )}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-soft" aria-hidden="true" />
          <span className="text-ink-mid">Minulý týden</span>
          <span className="font-bold tabular-nums text-ink-deep">
            {formatPosMoneyCompact(prevTotal, data.currency)}
          </span>
        </span>
      </div>

      <PosLineChart
        current={current}
        comparison={data.comparison}
        currency={data.currency}
        comparisonLabel={data.comparisonLabel}
        height={240}
        colors={{ bar: "#34d399", barTo: "#059669", comparison: "#BFC3C7" }}
      />

      <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
        Jen BOS prodejny · s DPH · změna je like-for-like vs minulý týden.
      </p>
    </section>
  );
}
