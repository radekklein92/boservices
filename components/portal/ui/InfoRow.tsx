import type { ReactNode } from "react";

// Sjednocený řádek label / hodnota v detailových sekcích. Prázdná hodnota
// se zobrazí jako „—" v tlumené barvě. Hodnota může být i JSX (např. odkaz);
// prázdná detekce se týká jen string/null/undefined.
export function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  const empty = value == null || value === "" || value === "—";
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-edge/60 py-2 last:border-0">
      <span className="shrink-0 text-[12.5px] text-ink-mid">{label}</span>
      <span
        className={`text-right text-[13px] ${empty ? "text-ink-soft" : "text-ink-base"} ${mono ? "font-mono" : ""}`}
      >
        {empty ? "—" : value}
      </span>
    </div>
  );
}
