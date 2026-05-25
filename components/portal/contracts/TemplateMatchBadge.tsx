"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

// Pill v hlavičce smlouvy: stav "soulad/změny" proti původní šabloně.
// Když jsou změny, klik otevře DiffModal (Word-style track changes).
// Když není co řešit, je pill jen informativní.
//
// Konzistence se zbytkem hlavičky:
//   - h-10 (= Stáhnout PDF, Přegenerovat PDF)
//   - rounded-full, gap-2, font-semibold, text-[13px]
//   - px-5 (= ostatní header pillsy)
//
// Barvy jsou jediný odchyl od monochromu portálu - záměrně, aby byl stav
// patrný na první pohled (zelená OK / červená warning).
export function TemplateMatchBadge({
  hasChanges,
  onOpenDiff,
}: {
  hasChanges: boolean;
  onOpenDiff: () => void;
}) {
  if (!hasChanges) {
    return (
      <span
        className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-600 bg-emerald-600 px-5 text-[13px] font-semibold text-paper"
        aria-label="Smlouva souhlasí se šablonou"
      >
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        Souhlasí s šablonou
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpenDiff}
      className="group inline-flex h-10 items-center gap-2 rounded-full border border-red-600 bg-red-600 px-5 text-[13px] font-semibold text-paper shadow-[0_1px_2px_rgba(220,38,38,0.18)] transition-transform active:translate-y-px"
      aria-label="Zobrazit změny proti šabloně"
    >
      <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      Pozor, změny
      <span
        aria-hidden="true"
        className="ml-1 text-paper/70 transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </button>
  );
}
