import type { ReactNode } from "react";

// Sjednocený prázdný stav pro seznamy/tabulky/panely. Jeden vizuální atom místo
// roztroušených ad-hoc textů „Zatím žádné…". Volitelná ikona + nadpis + popis +
// akce (CTA). Přeškrtnutý rámeček (dashed edge) drží decentní, neutrální tón.
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-edge bg-paper-warm px-6 py-12 text-center ${className ?? ""}`}
    >
      {icon && <div className="mb-3 text-ink-soft">{icon}</div>}
      <div className="text-[14px] font-semibold text-ink-base text-balance">{title}</div>
      {description && (
        <p className="mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-ink-mid">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
