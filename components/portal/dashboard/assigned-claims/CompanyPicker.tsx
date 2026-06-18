"use client";

import { useId } from "react";

// Lehký picker firmy: input + native <datalist>. Záměrně NE CompanyChipPicker
// (ten dělá ARES lookup a vrací IČO/adresu pro smlouvy) - tady chceme jen string,
// aby cross-ručení agregovalo na stejný řádek jako smluvní dlužník. Datalist
// renderuje mimo overflow kontejner modalu, takže se neusekne ve scrollu.
export function CompanyPicker({
  value,
  onChange,
  options,
  placeholder = "Název firmy",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const listId = useId();
  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-edge bg-paper px-3 text-[13px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
