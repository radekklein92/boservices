// Mini sparkline (bez os) pro KPI karty - dává číslu "život". Čisté SVG,
// non-scaling-stroke drží linku ostrou i při roztažení na šířku karty.
export function PosSparkline({
  values,
  className = "",
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const W = 100;
  const H = 28;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * W},${(H - ((v - min) / range) * H).toFixed(2)}`)
    .join(" ");
  const lastX = W;
  const lastY = H - ((values[values.length - 1] - min) / range) * H;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height={28}
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY.toFixed(2)} r={1.6} fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
