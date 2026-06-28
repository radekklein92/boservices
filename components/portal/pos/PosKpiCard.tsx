import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PosDeltaBadge } from "./PosDeltaBadge";
import { PosSparkline } from "./PosSparkline";

// KPI karta. Premium minimal: hairline povrch, hover lift, velké tabulkové číslo,
// pod ním delta + absolutní změna (research: absolutní hodnota vedle % koriguje
// klamné velké %), sparkline přes celou šířku dna. `value` je naformátovaný
// (velké částky kompaktně), `valueTitle` = přesná hodnota na hover.
// `href` udělá z karty proklik (Link + šipka u labelu) - viz drill-down Refundace.
export function PosKpiCard({
  label,
  value,
  valueTitle,
  current,
  previous,
  goodDir = "up",
  deltaMode = "pct",
  absolute,
  spark,
  emphasis = false,
  href,
}: {
  label: string;
  value: string;
  valueTitle?: string;
  current?: number;
  previous?: number | null;
  goodDir?: "up" | "down";
  deltaMode?: "pct" | "pp";
  absolute?: string;
  spark?: number[];
  emphasis?: boolean;
  href?: string;
}) {
  const containerCls = `group flex min-w-0 flex-col gap-2 rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-14px_rgba(14,14,14,0.22)] ${
    emphasis ? "border-ink-base bg-ink-base text-paper" : "border-edge bg-paper hover:border-ink-soft"
  } ${href ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper" : ""}`;

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[10.5px] font-medium uppercase tracking-[0.16em] ${
            emphasis ? "text-paper/60" : "text-ink-mid"
          }`}
        >
          {label}
        </span>
        {href && (
          <ArrowUpRight
            className={`h-3.5 w-3.5 shrink-0 transition-colors ${
              emphasis ? "text-paper/45 group-hover:text-paper" : "text-ink-soft group-hover:text-ink-base"
            }`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
      </div>

      <div
        title={valueTitle}
        className={`truncate text-[1.5rem] font-extrabold leading-[1.05] tracking-[-0.03em] tabular-nums ${
          emphasis ? "text-paper" : "text-ink-base"
        }`}
      >
        {value}
      </div>

      <div className="flex min-h-[16px] items-center gap-1.5 text-[11.5px]">
        {current !== undefined && (
          <PosDeltaBadge current={current} previous={previous ?? null} goodDir={goodDir} mode={deltaMode} />
        )}
        {absolute && (
          <span className={emphasis ? "tabular-nums text-paper/55" : "tabular-nums text-ink-soft"}>· {absolute}</span>
        )}
      </div>

      {spark && spark.length > 1 && (
        <div className="mt-auto pt-1">
          <PosSparkline values={spark} className={`h-7 w-full ${emphasis ? "text-paper/35" : "text-ink-soft"}`} />
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={containerCls} aria-label={`${label} - zobrazit detail`}>
        {inner}
      </Link>
    );
  }
  return <div className={containerCls}>{inner}</div>;
}
