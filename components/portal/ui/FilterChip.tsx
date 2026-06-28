"use client";

import type { LucideIcon } from "lucide-react";

// Sjednocená filtrovací pilulka pro celý portál (seznam smluv i lokalit).
// Aktivní = černá (ink-base), neaktivní = světlá s borderem. Volitelně vede
// lucide ikona nebo barevná tečka (identita kategorie) a počet vpravo.
export function FilterChip({
  active,
  onClick,
  label,
  count,
  Icon,
  dotClass,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  Icon?: LucideIcon;
  dotClass?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={[
        "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        active
          ? "border-ink-base bg-ink-base text-paper"
          : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
      ].join(" ")}
    >
      {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />}
      {dotClass && (
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      )}
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={`font-mono text-[11px] ${active ? "text-paper/70" : "text-ink-mid"}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
