import type { ReactNode } from "react";

// Pasivní chip (stav / kategorie / tag). Jeden vizuální atom pro celý portál.
// Tón (border+bg+text barvy) se předává zvenčí - mapy jsou u jednotlivých
// domén (CONTRACT_STATUS_STYLE, CATEGORY_STYLE, LOCATION_STATUS_STYLE…).
export const CHIP_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium";

export function Chip({
  tone,
  className,
  children,
}: {
  tone: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`${CHIP_CLASS} ${tone}${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}
