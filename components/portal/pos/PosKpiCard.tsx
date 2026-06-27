import type { ReactNode } from "react";
import { PosDeltaBadge } from "./PosDeltaBadge";
import { PosSparkline } from "./PosSparkline";

// KPI karta. Premium minimal: hairline povrch, jemný hover lift, popisek nahoře
// + delta vedle něj, velké tabulkové číslo, volitelná sparkline u dna pro pocit
// "živých dat". Měkké tónované stíny (ne čistá čerň).
export function PosKpiCard({
  label,
  value,
  hint,
  current,
  previous,
  goodDir = "up",
  spark,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  current?: number;
  previous?: number | null;
  goodDir?: "up" | "down";
  spark?: number[];
  emphasis?: boolean;
}) {
  return (
    <div
      className={`group flex flex-col gap-3 rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-14px_rgba(14,14,14,0.22)] ${
        emphasis ? "border-edge bg-ink-base text-paper" : "border-edge bg-paper hover:border-ink-soft"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`text-[10.5px] font-medium uppercase tracking-[0.16em] ${
            emphasis ? "text-paper/60" : "text-ink-mid"
          }`}
        >
          {label}
        </span>
        {current !== undefined && (
          <PosDeltaBadge current={current} previous={previous ?? null} goodDir={goodDir} className="text-[11px]" />
        )}
      </div>

      <div
        className={`text-[1.75rem] font-extrabold leading-[1] tracking-[-0.03em] tabular-nums ${
          emphasis ? "text-paper" : "text-ink-base"
        }`}
      >
        {value}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-1">
        {hint ? (
          <span className={`text-[11px] ${emphasis ? "text-paper/55" : "text-ink-soft"}`}>{hint}</span>
        ) : (
          <span />
        )}
        {spark && spark.length > 1 && (
          <PosSparkline
            values={spark}
            className={`w-[64px] shrink-0 ${emphasis ? "text-paper/40" : "text-ink-soft"}`}
          />
        )}
      </div>
    </div>
  );
}
