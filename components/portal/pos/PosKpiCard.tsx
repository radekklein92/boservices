import type { ReactNode } from "react";
import { PosDeltaBadge } from "./PosDeltaBadge";

// KPI karta: číslo + popisek + (volitelně) delta vs srovnávací období + podtitulek.
// Číslo má tabular-nums kvůli zarovnání. Delta se zobrazí jen když je current
// definované; jinak karta ukáže jen hodnotu.
export function PosKpiCard({
  label,
  value,
  hint,
  current,
  previous,
  goodDir = "up",
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  current?: number;
  previous?: number | null;
  goodDir?: "up" | "down";
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-edge bg-paper p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mid">
        {label}
      </div>
      <div className="text-[1.65rem] font-extrabold leading-none tracking-[-0.025em] text-ink-base tabular-nums">
        {value}
      </div>
      <div className="flex min-h-[16px] items-center gap-2 text-[11.5px] text-ink-mid">
        {current !== undefined && (
          <PosDeltaBadge current={current} previous={previous ?? null} goodDir={goodDir} className="text-[11.5px]" />
        )}
        {hint && <span className="truncate">{hint}</span>}
      </div>
    </div>
  );
}
