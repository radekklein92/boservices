import { formatPosNumber } from "./pos-shared";

// Generický seznam vodorovných pruhů (daypart / payment mix / DPH split).
// Mono, hodnota vpravo, volitelný podtitulek (počet / sazba). Pruh = podíl z maxima.
export interface BarRow {
  key: string;
  label: string;
  value: number;
  sub?: string;
}

export function PosBars({
  rows,
  formatValue,
}: {
  rows: BarRow[];
  formatValue?: (v: number) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="grid h-[120px] place-items-center rounded-2xl border border-edge bg-paper text-[13px] text-ink-mid">
        Bez dat.
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fmt = formatValue ?? ((v: number) => formatPosNumber(v));
  return (
    <div className="rounded-2xl border border-edge bg-paper p-2">
      {rows.map((r) => (
        <div key={r.key} className="rounded-xl px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-ink-deep">{r.label}</span>
            <span className="text-[13px] font-semibold tabular-nums text-ink-base">{fmt(r.value)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-edge">
              <span
                className="block h-full rounded-full bg-ink-base"
                style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
              />
            </span>
            {r.sub && <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">{r.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
