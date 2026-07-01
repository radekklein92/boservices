"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { FV } from "@/components/portal/ui/buttons";

// Sdílený custom single-select do toolbarů/filtrových řádků - náhrada nativního
// <select> (ten se nikde na portálu nepoužívá). Trigger = pilulka h-9 ve vzhledu
// BTN_TOOL (bg-paper), bublina = vzor MonthPicker / PosViewsMenu: rounded-2xl,
// stín, položky s hover bg-edge-warm, Check u vybrané, zavírání klikem mimo + Esc.
export interface SelectMenuOption {
  value: string;
  label: string;
}

export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  align = "left",
  className,
}: {
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  align?: "left" | "right"; // ke které hraně triggeru přiléhá bublina
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`inline-flex h-9 items-center gap-2 rounded-full border bg-paper px-3.5 text-[12.5px] font-medium transition-colors ${
          open
            ? "border-ink-base text-ink-base"
            : "border-edge text-ink-deep hover:border-ink-soft"
        } ${FV}`}
      >
        {current?.label ?? value}
        <ChevronDown
          className={`h-3.5 w-3.5 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute top-full z-40 mt-2 max-h-[320px] w-56 overflow-y-auto rounded-2xl border border-edge bg-paper p-1.5 shadow-[0_12px_40px_-12px_rgba(14,14,14,0.35)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setOpen(false);
                  if (o.value !== value) onChange(o.value);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-edge-warm ${
                  selected ? "font-semibold text-ink-base" : "text-ink-deep"
                }`}
              >
                <Check
                  className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-ink-base" : "invisible"}`}
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
