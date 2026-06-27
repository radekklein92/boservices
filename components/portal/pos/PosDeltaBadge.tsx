import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatPct, pctChange } from "./pos-shared";

// Směrová delta vs srovnávací období. Barevná gramatika: zelená/červená podle
// toho, jestli je změna "dobrá" (goodDir), ne podle směru. Plochá změna i
// nedostupné srovnání = neutrální šedá.
//
// mode="pp": pro metriky, které JSOU sazba (refundace) - delta v procentních
// bodech (rates 0..1 -> pp), ne procentní změna procenta. mode="pct": běžná % změna.
export function PosDeltaBadge({
  current,
  previous,
  goodDir = "up",
  mode = "pct",
  className = "",
}: {
  current: number;
  previous: number | null | undefined;
  goodDir?: "up" | "down";
  mode?: "pct" | "pp";
  className?: string;
}) {
  if (previous == null) {
    return <span className={`text-[11px] text-ink-soft ${className}`}>—</span>;
  }

  let up: boolean;
  let flat: boolean;
  let text: string;

  if (mode === "pp") {
    const pp = (current - previous) * 100;
    flat = Math.abs(pp) < 0.05;
    up = pp > 0;
    text = `${up ? "+" : flat ? "" : "-"}${Math.abs(pp).toFixed(1)} pp`;
  } else {
    const pct = pctChange(current, previous);
    if (pct === null) {
      return <span className={`text-[11px] text-ink-soft ${className}`}>—</span>;
    }
    flat = Math.abs(pct) < 0.0005;
    up = pct > 0;
    const digits = Math.abs(pct) >= 1 ? 0 : 1;
    text = `${up ? "+" : flat ? "" : "-"}${formatPct(Math.abs(pct), digits)}`;
  }

  const good = flat ? null : up ? goodDir === "up" : goodDir === "down";
  const color = flat ? "text-ink-mid" : good ? "text-emerald-600" : "text-rose-600";
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;

  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${color} ${className}`}>
      <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      {text}
    </span>
  );
}
