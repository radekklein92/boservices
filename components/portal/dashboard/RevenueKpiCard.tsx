import Link from "next/link";
import { ArrowUpRight, BarChart3 } from "lucide-react";
import { PosDeltaBadge } from "@/components/portal/pos/PosDeltaBadge";
import { PosSparkline } from "@/components/portal/pos/PosSparkline";
import {
  formatPosMoney,
  formatPosMoneyCompact,
  signedMoneyCompact,
} from "@/components/portal/pos/pos-shared";
import type { BosDashboardRevenue } from "@/lib/portal/pos/queries";

// Světlá KPI dlaždice tržeb (jen BOS prodejny) na dashboardu - místo "Podepsané
// smlouvy". Velké číslo + like-for-like delta + jemný emerald sparkline u dna
// bubliny (graf na pozadí). Klik -> sekce Tržby. Chrome konzistentní se
// SecondaryStat / peněžní dlaždicí pohledávek.
export function RevenueKpiCard({ data }: { data: BosDashboardRevenue | null }) {
  const spark = data?.daily.map((d) => d.gross) ?? [];
  const hasDelta =
    data != null && data.lflCurrentGross != null && data.lflPreviousGross != null;

  return (
    <Link
      href="/portal/pos"
      className="group relative overflow-hidden rounded-3xl border border-edge bg-paper p-7 transition-colors hover:border-ink-soft"
    >
      <BarChart3
        className="absolute -bottom-4 -right-4 h-32 w-32 text-ink-base/[0.04]"
        strokeWidth={1}
        aria-hidden="true"
      />
      {/* Sparkline u dna bubliny (graf na pozadí) */}
      {spark.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0" aria-hidden="true">
          <PosSparkline values={spark} className="h-14 w-full text-emerald-500/25" />
        </div>
      )}
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
            <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            Tržby (s DPH)
          </div>
          <ArrowUpRight
            className="h-4 w-4 text-ink-mid transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            strokeWidth={1.5}
          />
        </div>

        {data == null ? (
          <>
            <div className="mt-5 font-extrabold leading-none tracking-[-0.045em] text-ink-soft text-[clamp(2rem,4.6vw,2.85rem)]">
              —
            </div>
            <div className="mt-2.5 text-[13px] text-ink-mid">data dočasně nedostupná</div>
          </>
        ) : (
          <>
            <div
              title={formatPosMoney(data.headlineGross, data.currency)}
              className="mt-5 font-extrabold leading-none tracking-[-0.045em] text-ink-base text-[clamp(2rem,4.6vw,2.85rem)]"
            >
              {formatPosMoneyCompact(data.headlineGross, data.currency)}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[13px]">
              {hasDelta ? (
                <>
                  <PosDeltaBadge
                    current={data.lflCurrentGross as number}
                    previous={data.lflPreviousGross}
                    goodDir="up"
                  />
                  <span className="tabular-nums text-ink-soft">
                    {"· "}
                    {signedMoneyCompact(
                      (data.lflCurrentGross as number) - (data.lflPreviousGross as number),
                      data.currency,
                    )}
                  </span>
                </>
              ) : (
                <span className="text-ink-mid">tento týden</span>
              )}
            </div>
            <div className="mt-1 text-[12px] text-ink-soft">
              {hasDelta ? "tento týden vs minulý · jen BOS prodejny" : "jen BOS prodejny"}
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
