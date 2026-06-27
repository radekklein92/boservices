import { PosDeltaBadge } from "./PosDeltaBadge";
import { PosSparkline } from "./PosSparkline";

// KPI karta. Premium minimal: hairline povrch, jemný hover lift, popisek + delta
// nahoře, velké tabulkové číslo, sparkline přes celou šířku dna. `value` je už
// naformátovaný (u velkých částek kompaktně), `valueTitle` drží přesnou hodnotu
// na hover. `truncate` je pojistka proti přetečení.
export function PosKpiCard({
  label,
  value,
  valueTitle,
  current,
  previous,
  goodDir = "up",
  spark,
  emphasis = false,
}: {
  label: string;
  value: string;
  valueTitle?: string;
  current?: number;
  previous?: number | null;
  goodDir?: "up" | "down";
  spark?: number[];
  emphasis?: boolean;
}) {
  return (
    <div
      className={`group flex min-w-0 flex-col gap-3 rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-14px_rgba(14,14,14,0.22)] ${
        emphasis ? "border-ink-base bg-ink-base text-paper" : "border-edge bg-paper hover:border-ink-soft"
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
          <PosDeltaBadge
            current={current}
            previous={previous ?? null}
            goodDir={goodDir}
            className="shrink-0 text-[11px]"
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

      {spark && spark.length > 1 && (
        <div className="mt-auto pt-1">
          <PosSparkline values={spark} className={`h-7 w-full ${emphasis ? "text-paper/35" : "text-ink-soft"}`} />
        </div>
      )}
    </div>
  );
}
