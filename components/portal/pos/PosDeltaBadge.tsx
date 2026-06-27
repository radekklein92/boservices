import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatPct, pctChange } from "./pos-shared";

// Směrová delta vs srovnávací období. Barevná gramatika z výzkumu: zelená/červená
// JEN podle toho, jestli je změna "dobrá" (goodDir), ne podle směru jako takového.
// Plochá změna (~0) i nedostupné srovnání = neutrální šedá.
export function PosDeltaBadge({
  current,
  previous,
  goodDir = "up",
  className = "",
}: {
  current: number;
  previous: number | null | undefined;
  goodDir?: "up" | "down";
  className?: string;
}) {
  const pct = pctChange(current, previous);
  if (pct === null) {
    return <span className={`text-[11px] text-ink-soft ${className}`}>—</span>;
  }
  const flat = Math.abs(pct) < 0.0005;
  const up = pct > 0;
  const good = flat ? null : up ? goodDir === "up" : goodDir === "down";
  const color = flat ? "text-ink-mid" : good ? "text-emerald-600" : "text-rose-600";
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${color} ${className}`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      {formatPct(Math.abs(pct), 1)}
    </span>
  );
}
