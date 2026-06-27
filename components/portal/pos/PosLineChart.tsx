"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CHART } from "./chart-theme";
import { formatPosMoney } from "./pos-shared";

// Ručně psaný SVG graf POS trendu (2 série: aktuální vs srovnávací období).
// Adaptivní: krátká okna (<=31 bodů) = DENNÍ BARY + srovnávací linka přes ně
// (styl Dotykačky), dlouhá okna = plocha + linka. ResizeObserver -> kreslení
// 1:1 px, niceScale, HTML overlay tooltip. Žádná grafová knihovna. Série se
// zarovnávají podle INDEXU (srovnání má jiné kalendářní dny, ale stejnou délku).

export interface LinePoint {
  label: string;
  value: number;
}

const GRID = CHART.grid;
const AXIS = CHART.axis;
const BAR_MODE_MAX = 31;

function niceScale(maxVal: number): { yMax: number; ticks: number[] } {
  const m = Math.max(maxVal, 1);
  const rough = m / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const cand = [1, 2, 5, 10].map((c) => c * pow);
  const step = cand.find((c) => c >= rough) ?? 10 * pow;
  return { yMax: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

function fmtCompact(v: number): string {
  return new Intl.NumberFormat("cs-CZ", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

export function PosLineChart({
  current,
  comparison = null,
  currency,
  comparisonLabel = "Předchozí období",
  height = 300,
}: {
  current: LinePoint[];
  comparison?: number[] | null;
  currency: string;
  comparisonLabel?: string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
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

  const n = current.length;
  const hasCmp = !!comparison && comparison.length > 0;
  const bars = n > 1 && n <= BAR_MODE_MAX;

  const { yMax, ticks } = useMemo(() => {
    const vals = current.map((p) => p.value).concat(hasCmp ? (comparison as number[]) : []);
    return niceScale(Math.max(1, ...vals));
  }, [current, comparison, hasCmp]);

  if (n === 0) {
    return (
      <div className="grid h-[200px] place-items-center rounded-2xl border border-edge bg-paper text-[13px] text-ink-mid">
        Pro zvolené období nejsou data.
      </div>
    );
  }

  const VW = Math.max(320, Math.round(w));
  const VH = height;
  const PAD = { l: 56, r: 18, t: 16, b: 30 };
  const x0 = PAD.l;
  const x1 = VW - PAD.r;
  const yTop = PAD.t;
  const yBot = VH - PAD.b;
  const plotW = x1 - x0;
  const plotH = yBot - yTop;

  // Bars: střed v každém slotu. Line: rozprostřít od kraje ke kraji.
  const slot = bars ? plotW / n : n > 1 ? plotW / (n - 1) : plotW;
  const xOf = (i: number) => (bars ? x0 + (i + 0.5) * slot : n === 1 ? (x0 + x1) / 2 : x0 + i * slot);
  const yOf = (v: number) => yBot - (v / yMax) * plotH;
  const barW = Math.min(44, slot * 0.62);

  const labelEvery = n <= 10 ? 1 : Math.ceil(n / 8);
  const showXLabel = (i: number) => i === 0 || i === n - 1 || i % labelEvery === 0;

  const curCoords = current.map((p, i) => [xOf(i), yOf(p.value)] as const);
  const cmpCoords = hasCmp
    ? (comparison as number[]).slice(0, n).map((v, i) => [xOf(i), yOf(v)] as const)
    : [];
  const line = (coords: ReadonlyArray<readonly [number, number]>) =>
    coords.map((c) => `${c[0]},${c[1]}`).join(" ");
  const area =
    !bars && n > 1
      ? `M ${curCoords[0][0]},${curCoords[0][1]} ` +
        curCoords.slice(1).map((c) => `L ${c[0]},${c[1]}`).join(" ") +
        ` L ${curCoords[n - 1][0]},${yBot} L ${curCoords[0][0]},${yBot} Z`
      : "";

  const activeX = active !== null ? xOf(active) : 0;
  const placeRight = active === null || activeX < VW / 2;

  return (
    <div className="rounded-2xl border border-edge bg-paper p-3 sm:p-4">
      <div ref={wrapRef} className="relative">
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          height={VH}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Graf vývoje tržeb v čase"
          onMouseLeave={() => setActive(null)}
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            <linearGradient id="pos-line-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.current} stopOpacity={0.12} />
              <stop offset="100%" stopColor={CHART.current} stopOpacity={0} />
            </linearGradient>
          </defs>

          {ticks.map((t) => {
            const y = yOf(t);
            return (
              <g key={t}>
                <line x1={x0} y1={y} x2={x1} y2={y} stroke={GRID} strokeWidth={1} />
                <text
                  x={x0 - 10}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={11}
                  fill={AXIS}
                  className="tabular-nums"
                >
                  {fmtCompact(t)}
                </text>
              </g>
            );
          })}

          {/* Aktuální série */}
          {bars
            ? current.map((p, i) => {
                const h = Math.max(0, yBot - yOf(p.value));
                const dim = active !== null && active !== i;
                return (
                  <rect
                    key={`bar-${i}`}
                    x={xOf(i) - barW / 2}
                    y={yOf(p.value)}
                    width={barW}
                    height={h}
                    rx={Math.min(4, barW / 4)}
                    fill={CHART.current}
                    opacity={dim ? 0.5 : 1}
                    style={{ transition: "opacity 150ms" }}
                  />
                );
              })
            : (
              <>
                {n > 1 && <path d={area} fill="url(#pos-line-grad)" />}
                {n > 1 && (
                  <polyline
                    points={line(curCoords)}
                    fill="none"
                    stroke={CHART.current}
                    strokeWidth={2.25}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
              </>
            )}

          {/* Srovnávací série (šedá linka + tečky) - přes bary i přes linku */}
          {hasCmp && cmpCoords.length >= 2 && (
            <>
              <polyline
                points={line(cmpCoords)}
                fill="none"
                stroke={CHART.comparison}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={bars ? "0" : "0"}
              />
              {bars &&
                cmpCoords.map((c, i) => (
                  <circle key={`cmp-${i}`} cx={c[0]} cy={c[1]} r={2.5} fill={CHART.comparison} />
                ))}
            </>
          )}

          {active !== null && !bars && (
            <line
              x1={xOf(active)}
              y1={yTop}
              x2={xOf(active)}
              y2={yBot}
              stroke={CHART.comparison}
              strokeWidth={1}
              strokeDasharray="3 4"
            />
          )}

          {/* Body aktuální linky (jen line mode, u řídkých dat) */}
          {!bars &&
            current.map((p, i) => {
              const isActive = active === i;
              if (!isActive && n > 14) return null;
              return <circle key={`pt-${i}`} cx={xOf(i)} cy={yOf(p.value)} r={isActive ? 4.5 : 3} fill={CHART.current} />;
            })}

          {/* X popisky */}
          {current.map((p, i) =>
            showXLabel(i) ? (
              <text
                key={`xl-${i}`}
                x={xOf(i)}
                y={yBot + 18}
                textAnchor="middle"
                fontSize={11}
                fill={AXIS}
                className="tabular-nums"
              >
                {p.label}
              </text>
            ) : null,
          )}

          {/* Hover zóny */}
          {current.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={Math.max(x0, xOf(i) - slot / 2)}
              y={yTop}
              width={slot}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
              onTouchStart={() => setActive(i)}
              style={{ cursor: "pointer" }}
            />
          ))}
        </svg>

        {active !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-[190px] rounded-xl border border-edge bg-paper px-3 py-2.5 shadow-[0_12px_28px_-12px_rgba(14,14,14,0.3)]"
            style={placeRight ? { left: activeX + 12 } : { right: VW - activeX + 12 }}
          >
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              {current[active].label}
            </div>
            <div className="flex flex-col gap-2 text-[12px] leading-none">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CHART.current }} aria-hidden="true" />
                <span className="text-ink-mid">Aktuální</span>
                <span className="ml-auto font-bold tabular-nums text-ink-base">
                  {formatPosMoney(current[active].value, currency)}
                </span>
              </div>
              {hasCmp && active < (comparison as number[]).length && (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CHART.comparison }} aria-hidden="true" />
                  <span className="text-ink-mid">{comparisonLabel}</span>
                  <span className="ml-auto font-bold tabular-nums text-ink-base">
                    {formatPosMoney((comparison as number[])[active], currency)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
