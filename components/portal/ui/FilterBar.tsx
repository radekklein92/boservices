"use client";

import type { ReactNode } from "react";
import { FV } from "@/components/portal/ui/buttons";

// Jednotný řádek filtrů (řádek pod samostatným hledáním) - vzor stránky Real Estate.
// Filtry (chipy) jsou vlevo, počet výsledků + pohledové ovladače vpravo (`trailing`,
// zarovnané k pravému kraji přes ml-auto). Stejné napříč celým portálem:
//
//   [label?] [FilterChip …] [FilterBar.Divider] [FilterChip …] [reset?]  ———  [trailing: ResultCount + ovladače]
//
// - `children` = chipy (typicky <FilterChip/>), oddělovače <FilterBar.Divider/>.
// - `trailing` = <ResultCount/> a pohledové ovladače (Vývoj v čase, Excel, Sloupce,
//                řazení, měsíční navigace, přepínače) - vždy u pravého kraje.
// - `onReset`  = volitelný textový reset (vlevo, za chipy).
export function FilterBar({
  label,
  children,
  trailing,
  onReset,
  resetActive,
  resetLabel = "Zrušit filtr",
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  onReset?: () => void;
  resetActive?: boolean;
  resetLabel?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {label && (
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
          {label}
        </span>
      )}
      {children}
      {onReset && resetActive && (
        <button
          type="button"
          onClick={onReset}
          className={`ml-1 text-[12px] font-medium text-ink-mid underline-offset-2 transition-colors hover:text-ink-base hover:underline ${FV}`}
        >
          {resetLabel}
        </button>
      )}
      {trailing && (
        <div className="ml-auto flex flex-wrap items-center gap-3">{trailing}</div>
      )}
    </div>
  );
}

// Svislý oddělovač mezi skupinami chipů - stejný napříč portálem.
FilterBar.Divider = function FilterBarDivider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-edge" aria-hidden="true" />;
};
