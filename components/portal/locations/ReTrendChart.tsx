"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Ručně psaný SVG line chart pro „Vývoj v čase" Real Estate (3 série: Řešit /
// Vyřešeno / Červeně). Sdílené mezi modalem na stránce Real Estate
// (ReTrendButton) a kartou na Dashboardu. Žádná grafová knihovna — plná kontrola
// estetiky a nula bundle navíc.
//
// Graf měří skutečnou šířku (ResizeObserver) a kreslí v poměru 1:1 px s PEVNOU
// výškou — text i body tak mají normální velikost nezávisle na šířce karty.
//
// `ReTrendPanel` má dvě varianty:
// - "full" (modal): tři velké dlaždice s čísly + vyšší graf.
// - "compact" (dashboard): štíhlý legend řádek + nižší graf bez vnořeného rámu.
// Data (points) sestavuje server (buildReTrendPoints); poslední bod je vždy ŽIVÝ.
// ─────────────────────────────────────────────────────────────────────────────

export type Point = {
  weekKey: string;
  weekEnd: string;
  needs: number;
  resolved: number;
  red: number;
  capturedAt: string;
  live: boolean;
};

type SeriesKey = "needs" | "resolved" | "red";
const SERIES: ReadonlyArray<{
  key: SeriesKey;
  label: string;
  color: string;
  goodDir: "up" | "down";
}> = [
  { key: "needs", label: "Řešit", color: "#f59e0b", goodDir: "down" }, // amber-500
  { key: "resolved", label: "Vyřešeno", color: "#10b981", goodDir: "up" }, // emerald-500
  { key: "red", label: "Červeně", color: "#ef4444", goodDir: "down" }, // red-500
];

export function ReTrendPanel({
  points,
  variant = "full",
}: {
  points: Point[];
  variant?: "full" | "compact";
}) {
  const live = points[points.length - 1];
  // Předchozí týden = poslední uložený snímek před živým bodem.
  const prev = points.length >= 2 ? points[points.length - 2] : null;
  const compact = variant === "compact";

  return (
    <div className="flex flex-col gap-4">
      {compact ? (
        <StatLegend live={live} prev={prev} />
      ) : (
        <StatTiles live={live} prev={prev} />
      )}

      <TrendChart points={points} height={compact ? 200 : 300} bordered={!compact} />

      <p className="text-[11px] leading-relaxed text-ink-soft">
        {compact
          ? "Z lokalit v importu NewCo. Tečkovaný úsek = aktuální, neuzavřený týden (živý odhad)."
          : "Počítáno z lokalit v importu NewCo (stejně jako chipy nad tabulkou Real Estate). Tečkovaný úsek a dutý bod = aktuální, ještě neuzavřený týden (živý odhad)."}
        {points.length === 1 &&
          " Křivka se začne tvořit od příštího pondělí, kdy se uloží první týdenní snímek."}
      </p>
    </div>
  );
}

// Tři velké dlaždice (modal) — readout aktuálního týdne.
function StatTiles({ live, prev }: { live: Point; prev: Point | null }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {SERIES.map((s) => {
        const cur = live[s.key];
        const delta = prev ? cur - prev[s.key] : null;
        return (
          <div
            key={s.key}
            className="rounded-[18px] border border-edge bg-paper-warm px-4 py-3.5"
          >
            <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-mid">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              {s.label}
            </span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-[2rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-ink-base">
                {cur}
              </span>
              {delta !== null && <DeltaBadge dir={s.goodDir} delta={delta} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Štíhlý legend řádek (dashboard) — kompaktní readout + zároveň legenda grafu.
function StatLegend({ live, prev }: { live: Point; prev: Point | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
      {SERIES.map((s) => {
        const cur = live[s.key];
        const delta = prev ? cur - prev[s.key] : null;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-mid">
              {s.label}
            </span>
            <span className="text-[1.25rem] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-ink-base">
              {cur}
            </span>
            {delta !== null && <DeltaBadge dir={s.goodDir} delta={delta} />}
          </div>
        );
      })}
    </div>
  );
}

function DeltaBadge({ dir, delta }: { dir: "up" | "down"; delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums text-ink-soft">
        ±0
      </span>
    );
  }
  const good = dir === "up" ? delta > 0 : delta < 0;
  const tone = good ? "text-emerald-600" : "text-red-500";
  const Icon = delta > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums ${tone}`}
      title="Změna oproti minulému týdnu"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

// ── Samotný SVG graf ──────────────────────────────────────────────────────────

const GRID = "rgba(23,23,23,0.07)";
const AXIS = "rgba(23,23,23,0.42)";
const TIP_TEXT = "rgba(23,23,23,0.92)";
const TIP_BORDER = "rgba(23,23,23,0.12)";

function niceScale(maxVal: number): { yMax: number; ticks: number[] } {
  const m = Math.max(maxVal, 4);
  const rough = m / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const cand = [1, 2, 5, 10].map((c) => c * pow);
  const step = cand.find((c) => c >= rough) ?? 10 * pow;
  return { yMax: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => Math.round(i * step)) };
}

function fmtDM(weekEnd: string): string {
  const [, m, d] = weekEnd.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

function TrendChart({
  points,
  height = 300,
  bordered = true,
}: {
  points: Point[];
  height?: number;
  bordered?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Skutečná šířka vykreslené plochy → kreslíme 1:1 px (žádné proporční
  // nafouknutí textu/bodů). Fallback 760 jen do prvního změření po mountu.
  const [w, setW] = useState(760);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const VW = Math.max(320, Math.round(w));
  const VH = height;
  const PAD = { l: 34, r: 18, t: 16, b: 30 };
  const x0 = PAD.l;
  const x1 = VW - PAD.r;
  const yTop = PAD.t;
  const yBot = VH - PAD.b;
  const plotW = x1 - x0;
  const plotH = yBot - yTop;
  const n = points.length;

  const { yMax, ticks } = useMemo(() => {
    const maxVal = Math.max(
      1,
      ...points.flatMap((p) => [p.needs, p.resolved, p.red]),
    );
    return niceScale(maxVal);
  }, [points]);

  const xOf = (i: number) => (n === 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * plotW);
  const yOf = (v: number) => yBot - (v / yMax) * plotH;

  // Které x-osy popisky vykreslit (vždy první a poslední, jinak prořídit).
  const labelEvery = n <= 7 ? 1 : Math.ceil(n / 6);
  const showXLabel = (i: number) =>
    i === 0 || i === n - 1 || i % labelEvery === 0;

  const activeX = active !== null ? xOf(active) : 0;
  const placeRight = active === null || activeX < VW / 2;
  const activePoint = active !== null ? points[active] : null;

  return (
    <div
      className={
        bordered ? "rounded-[20px] border border-edge bg-paper p-3 sm:p-4" : ""
      }
    >
      <div ref={wrapRef} className="relative">
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        height={VH}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Graf vývoje počtů kategorií v čase"
        onMouseLeave={() => setActive(null)}
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          {SERIES.map((s) => (
            <linearGradient
              key={s.key}
              id={`re-grad-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {/* Vodorovné gridlines + y popisky */}
        {ticks.map((t) => {
          const y = yOf(t);
          return (
            <g key={t}>
              <line x1={x0} y1={y} x2={x1} y2={y} stroke={GRID} strokeWidth={1} />
              <text
                x={x0 - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={11}
                fill={AXIS}
                className="tabular-nums"
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* Plochy + křivky per série */}
        {SERIES.map((s) => {
          const coords = points.map(
            (p, i) => [xOf(i), yOf(p[s.key])] as const,
          );
          if (n === 1) return null; // jediný bod → jen tečky níž
          const areaD =
            `M ${coords[0][0]},${coords[0][1]} ` +
            coords
              .slice(1)
              .map((c) => `L ${c[0]},${c[1]}`)
              .join(" ") +
            ` L ${coords[n - 1][0]},${yBot} L ${coords[0][0]},${yBot} Z`;
          // Plná část (uložené týdny) + tečkovaný poslední úsek k živému bodu.
          const solid = coords.slice(0, n - 1);
          const solidPts = solid.map((c) => `${c[0]},${c[1]}`).join(" ");
          const lastA = coords[n - 2];
          const lastB = coords[n - 1];
          return (
            <g key={s.key}>
              <path d={areaD} fill={`url(#re-grad-${s.key})`} />
              {solid.length >= 2 && (
                <polyline
                  points={solidPts}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              <line
                x1={lastA[0]}
                y1={lastA[1]}
                x2={lastB[0]}
                y2={lastB[1]}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="3 4"
              />
            </g>
          );
        })}

        {/* Aktivní svislé vodítko */}
        {active !== null && (
          <line
            x1={xOf(active)}
            y1={yTop}
            x2={xOf(active)}
            y2={yBot}
            stroke={TIP_BORDER}
            strokeWidth={1}
            strokeDasharray="3 4"
          />
        )}

        {/* Body per série */}
        {SERIES.map((s) =>
          points.map((p, i) => {
            const cx = xOf(i);
            const cy = yOf(p[s.key]);
            const isActive = active === i;
            if (p.live) {
              // Živý bod = dutý prstenec.
              return (
                <circle
                  key={`${s.key}-${i}`}
                  cx={cx}
                  cy={cy}
                  r={isActive ? 5 : 4}
                  fill="#ffffff"
                  stroke={s.color}
                  strokeWidth={2}
                />
              );
            }
            return (
              <circle
                key={`${s.key}-${i}`}
                cx={cx}
                cy={cy}
                r={isActive ? 4.5 : n <= 10 ? 3 : 2.4}
                fill={s.color}
              />
            );
          }),
        )}

        {/* X popisky */}
        {points.map((p, i) =>
          showXLabel(i) ? (
            <text
              key={`xl-${i}`}
              x={xOf(i)}
              y={yBot + 18}
              textAnchor="middle"
              fontSize={11}
              fill={p.live ? TIP_TEXT : AXIS}
              fontWeight={p.live ? 600 : 400}
              className="tabular-nums"
            >
              {p.live ? "nyní" : fmtDM(p.weekEnd)}
            </text>
          ) : null,
        )}

        {/* Neviditelné hover zóny (musí být nahoře) */}
        {points.map((p, i) => {
          const slot = n > 1 ? plotW / (n - 1) : plotW;
          const rx = n > 1 ? xOf(i) - slot / 2 : x0;
          return (
            <rect
              key={`hit-${i}`}
              x={Math.max(x0, rx)}
              y={yTop}
              width={n > 1 ? slot : plotW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
              onTouchStart={() => setActive(i)}
              style={{ cursor: "pointer" }}
            />
          );
        })}
        </svg>

        {/* Tooltip = HTML overlay (přesná typografie/zarovnání). Graf kreslí 1:1 px,
            takže xOf()/VW v px sedí na pozici v tomto relativním kontejneru. */}
        {activePoint && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-[160px] rounded-xl border border-edge bg-paper px-3 py-2.5 shadow-[0_12px_28px_-12px_rgba(14,14,14,0.3)]"
            style={
              placeRight ? { left: activeX + 12 } : { right: VW - activeX + 12 }
            }
          >
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              {activePoint.live
                ? "Tento týden"
                : `Týden do ${fmtDM(activePoint.weekEnd)}`}
            </div>
            <div className="flex flex-col gap-2">
              {SERIES.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center gap-2 text-[12px] leading-none"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  <span className="text-ink-mid">{s.label}</span>
                  <span className="ml-auto font-bold tabular-nums text-ink-base">
                    {activePoint[s.key]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

