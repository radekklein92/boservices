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
// Tonální stav (Chip jazyk portálu): jemné pozadí -50 + barevný text -700,
// zelená OK / červená warning. Sjednoceno s ostatními stavovými štítky.
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
        className="inline-flex h-10 items-center gap-2 rounded-full border border-good/30 bg-good/10 px-5 text-[13px] font-semibold text-good"
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
      className="group inline-flex h-10 items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-5 text-[13px] font-semibold text-warn transition-all hover:border-warn/60 hover:bg-warn/15 active:translate-y-px"
      aria-label="Zobrazit změny proti šabloně"
    >
      <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      Pozor, změny
      <span
        aria-hidden="true"
        className="ml-1 text-warn transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </button>
  );
}
