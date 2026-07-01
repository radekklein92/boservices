// Jednotné počítadlo výsledků ("07 / 334"). Extrahováno z opakovaného spanu
// (Klienti/Lokality/Smlouvy). Tabulární číslice, ať se šířka nemění při psaní.
// Server-safe (bez hooků) - lze použít i v server komponentě.
export function ResultCount({
  shown,
  total,
  pad = true,
  className,
}: {
  shown: number;
  total: number;
  pad?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[12px] tabular-nums text-ink-soft ${className ?? ""}`}
    >
      {pad ? String(shown).padStart(2, "0") : shown} /{" "}
      {pad ? String(total).padStart(2, "0") : total}
    </span>
  );
}
