// Sdílené konstanty pro grafy POS dashboardu, odvozené z design tokenů portálu
// (app/globals.css @theme). Pravidlo z výzkumu: aktuální série = inkoust,
// srovnávací série = šedá; zelená/červená JEN pro směrové delty (PosDeltaBadge),
// nikdy pro samotné série.
export const CHART = {
  current: "#0E0E0E", // ink-base
  comparison: "#BFC3C7", // ink-soft (šedá srovnávací série)
  grid: "rgba(14,14,14,0.07)",
  axis: "rgba(14,14,14,0.42)",
  // Heatmapa hodina x den: intenzitní rampa na inkoustové škále.
  heatEmpty: "#F2F3F1", // edge-warm (nulová intenzita)
  heatMax: "#0E0E0E", // ink-base (maximum)
} as const;

export const CHART_FONT = "var(--font-sans)";

// Lineární interpolace dlaždice heatmapy: 0 -> edge-warm, 1 -> ink-base.
export function heatColor(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const from = [242, 243, 241]; // edge-warm
  const to = [14, 14, 14]; // ink-base
  const ch = from.map((f, i) => Math.round(f + (to[i] - f) * c));
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}
