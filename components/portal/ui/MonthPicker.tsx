"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Check } from "lucide-react";
import { FV } from "@/components/portal/ui/buttons";

// Sdílený volič měsíce: pill s chevrony (předchozí/další) + klikací label,
// který otevře bublinu s mřížkou měsíců po letech. Zavírá se klikem mimo / Esc.
// Vzor popoveru = shell/RoleSwitcherButton. Měsíce mimo dostupný rozsah jsou
// vypnuté. Klíč měsíce = "YYYY-MM".
const MONTHS_FULL = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
];
const MONTHS_SHORT = [
  "Led",
  "Úno",
  "Bře",
  "Dub",
  "Kvě",
  "Čvn",
  "Čvc",
  "Srp",
  "Zář",
  "Říj",
  "Lis",
  "Pro",
];

function parse(key: string): { y: number; m: number } {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  return { y, m };
}

function fullLabel(key: string): string {
  const { y, m } = parse(key);
  return `${MONTHS_FULL[m - 1]} ${y}`;
}

export function MonthPicker({
  months,
  selected,
  onSelect,
  pending,
}: {
  months: string[];
  selected: string;
  onSelect: (month: string) => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const idx = months.indexOf(selected);
  const prevMonth = idx > 0 ? months[idx - 1] : null;
  const nextMonth = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;

  // Zavřít na kliknutí mimo / Esc (vzor RoleSwitcherButton).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Dostupné měsíce seskupené po letech (nejnovější rok nahoře).
  const years = useMemo(() => {
    const available = new Set(months);
    const ys = [...new Set(months.map((k) => parse(k).y))].sort((a, b) => b - a);
    return ys.map((y) => ({
      year: y,
      cells: Array.from({ length: 12 }, (_, i) => {
        const key = `${y}-${String(i + 1).padStart(2, "0")}`;
        return { m: i + 1, key, enabled: available.has(key) };
      }),
    }));
  }, [months]);

  function choose(key: string) {
    setOpen(false);
    if (key !== selected) onSelect(key);
  }

  return (
    <div className="relative" ref={ref}>
      <div className="inline-flex items-center gap-1 rounded-full border border-edge bg-paper p-1">
        <button
          type="button"
          onClick={() => onSelect(prevMonth!)}
          disabled={!prevMonth}
          aria-label="Předchozí měsíc"
          className="grid h-8 w-8 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`inline-flex h-8 min-w-[150px] items-center justify-center gap-1.5 rounded-full px-2 text-[13.5px] font-semibold tracking-[-0.01em] text-ink-base transition-colors hover:bg-edge-warm ${
            pending ? "opacity-40" : ""
          } ${FV}`}
        >
          {fullLabel(selected)}
          <ChevronDown
            className={`h-3.5 w-3.5 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={() => onSelect(nextMonth!)}
          disabled={!nextMonth}
          aria-label="Další měsíc"
          className="grid h-8 w-8 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Výběr měsíce"
          className="absolute left-1/2 top-full z-50 mt-2 max-h-[320px] w-64 -translate-x-1/2 overflow-y-auto rounded-2xl border border-edge bg-paper p-2 shadow-[0_12px_40px_-12px_rgba(14,14,14,0.35)]"
        >
          {years.map(({ year, cells }) => (
            <div key={year} className="px-1 pb-1.5">
              <div className="px-1 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mid">
                {year}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {cells.map(({ m, key, enabled }) => {
                  const isSelected = key === selected;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!enabled}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => choose(key)}
                      className={`inline-flex h-8 items-center justify-center gap-1 rounded-lg text-[12.5px] font-medium transition-colors ${
                        isSelected
                          ? "bg-ink-base text-paper"
                          : enabled
                            ? "text-ink-deep hover:bg-edge-warm hover:text-ink-base"
                            : "cursor-not-allowed text-ink-soft/40"
                      }`}
                    >
                      {isSelected && (
                        <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                      )}
                      {MONTHS_SHORT[m - 1]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
