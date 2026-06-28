import Link from "next/link";
import { ArrowUpRight, BarChart3 } from "lucide-react";
import { PosDeltaBadge } from "@/components/portal/pos/PosDeltaBadge";
import { PosSparkline } from "@/components/portal/pos/PosSparkline";
import { formatPosMoney } from "@/components/portal/pos/pos-shared";
import type { BosDashboardRevenue } from "@/lib/portal/pos/queries";

// Celá částka se znaménkem (ne kompaktní mil./tis.) - dashboard všude píše plné
// částky (pohledávky, provize), ať je dlaždice tržeb konzistentní.
function signedMoney(delta: number, currency: string): string {
  return (delta >= 0 ? "+" : "-") + formatPosMoney(Math.abs(delta), currency);
}

// Světlá KPI dlaždice tržeb za POSLEDNÍCH 30 DNÍ (jen BOS prodejny) - místo
// "Podepsané smlouvy". Týden je v grafu nad ní; tady je 30denní souhrn. Velké
// číslo + like-for-like delta (vs předchozích 30 dní) + jemný emerald sparkline
// u dna bubliny. Klik -> sekce Tržby. Chrome konzistentní se SecondaryStat /
// peněžní dlaždicí pohledávek.
export function RevenueKpiCard({ data }: { data: BosDashboardRevenue | null }) {
  const spark = data?.last30Spark ?? [];
  const hasDelta =
    data != null &&
    data.last30LflCurrentGross != null &&
    data.last30LflPreviousGross != null;

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
            <div className="mt-2.5 text-[13px] text-ink-mid">data se připravují</div>
          </>
        ) : (
          <>
            <div className="mt-5 font-extrabold leading-none tracking-[-0.045em] text-ink-base text-[clamp(2rem,4.6vw,2.85rem)]">
              {formatPosMoney(data.last30Gross, data.currency)}
            </div>
            <div className="mt-3 flex min-h-[18px] flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
              {hasDelta && (
                <>
                  <PosDeltaBadge
                    current={data.last30LflCurrentGross as number}
                    previous={data.last30LflPreviousGross}
                    goodDir="up"
                  />
                  <span className="tabular-nums text-ink-soft">
                    {"· "}
                    {signedMoney(
                      (data.last30LflCurrentGross as number) -
                        (data.last30LflPreviousGross as number),
                      data.currency,
                    )}
                  </span>
                </>
              )}
            </div>
            <div className="mt-1.5 text-[13px] text-ink-mid">
              posledních 30 dní · jen BOS prodejny
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
