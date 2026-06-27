import type { HeatmapCell } from "@/lib/portal/pos/types";
import { heatColor } from "./chart-theme";
import { DOW_LABEL, formatPosMoney, formatPosNumber } from "./pos-shared";

// Heatmapa hodina x den v týdnu. Mono intenzitní ramp (edge-warm -> ink).
// API dow: 0=Ne..6=So; zobrazujeme Po-první. Intenzita dle tržeb (gross).
const ROW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Po..Ne
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function PosHeatmap({ cells, currency }: { cells: HeatmapCell[]; currency: string }) {
  if (cells.length === 0) {
    return (
      <div className="grid h-[160px] place-items-center rounded-2xl border border-edge bg-paper text-[13px] text-ink-mid">
        Pro zvolené období nejsou data.
      </div>
    );
  }
  const byKey = new Map<string, HeatmapCell>();
  let max = 0;
  for (const c of cells) {
    byKey.set(`${c.dow}-${c.hour}`, c);
    if (c.gross > max) max = c.gross;
  }
  const safeMax = max || 1;

  return (
    <div className="rounded-2xl border border-edge bg-paper p-4">
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* Hlavička hodin (po 3 h) */}
          <div className="mb-1 flex pl-8">
            {HOURS.map((h) => (
              <div key={h} className="flex-1 text-center text-[9px] tabular-nums text-ink-soft">
                {h % 3 === 0 ? h : ""}
              </div>
            ))}
          </div>
          {ROW_ORDER.map((dow) => (
            <div key={dow} className="flex items-center">
              <div className="w-8 shrink-0 text-[10.5px] font-medium text-ink-mid">{DOW_LABEL[dow]}</div>
              <div className="flex flex-1 gap-[2px]">
                {HOURS.map((h) => {
                  const cell = byKey.get(`${dow}-${h}`);
                  const v = cell?.gross ?? 0;
                  const t = v > 0 ? 0.12 + 0.88 * (v / safeMax) : 0;
                  return (
                    <div
                      key={h}
                      className="aspect-square flex-1 rounded-[2px]"
                      style={{ backgroundColor: v > 0 ? heatColor(t) : "var(--color-edge-warm)" }}
                      title={
                        cell
                          ? `${DOW_LABEL[dow]} ${h}:00 · ${formatPosMoney(v, currency)} · ${formatPosNumber(cell.receipts)} úč.`
                          : `${DOW_LABEL[dow]} ${h}:00 · 0`
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
          {/* Legenda */}
          <div className="mt-3 flex items-center gap-2 pl-8">
            <span className="text-[10px] text-ink-soft">méně</span>
            <div className="flex gap-[2px]">
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <span
                  key={t}
                  className="h-2.5 w-5 rounded-[2px]"
                  style={{ backgroundColor: t === 0 ? "var(--color-edge-warm)" : heatColor(0.12 + 0.88 * t) }}
                />
              ))}
            </div>
            <span className="text-[10px] text-ink-soft">více</span>
          </div>
        </div>
      </div>
    </div>
  );
}
