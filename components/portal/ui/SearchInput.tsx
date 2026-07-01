"use client";

import { Search } from "lucide-react";
import { FV } from "@/components/portal/ui/buttons";

// Jednotné vyhledávací pole portálu. Extrahováno z opakovaného inline inputu
// (Klienti/Lokality/Smlouvy) - jeden vzhled, jedna výška, jeden focus stav.
//   size="md" (default) = h-11, řádek hlavičky/toolbaru seznamu
//   size="sm"           = h-9, hustší lišta vedle h-9 ovladačů
export function SearchInput({
  value,
  onChange,
  placeholder = "Hledat…",
  size = "md",
  autoFocus,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  size?: "md" | "sm";
  autoFocus?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const sm = size === "sm";
  return (
    <div className={`relative w-full max-w-[400px] flex-1 ${className ?? ""}`}>
      <Search
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-mid ${
          sm ? "left-3.5 h-3.5 w-3.5" : "left-4 h-4 w-4"
        }`}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? placeholder}
        className={`w-full rounded-full border border-edge bg-paper text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base ${
          sm ? "h-9 pl-9 pr-3.5 text-[12.5px]" : "h-11 pl-11 pr-4 text-[14px]"
        } ${FV}`}
      />
    </div>
  );
}
