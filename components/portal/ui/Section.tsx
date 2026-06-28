import type { ReactNode } from "react";

// Sjednocená karta sekce na detailových stránkách (Lokalita / Klient / …).
// Karta + nadpis (volitelně hint a akce vpravo).
export function Section({
  title,
  hint,
  action,
  className,
  children,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-edge bg-paper p-6${className ? ` ${className}` : ""}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {/* Kanon nadpisu karetní sekce: 13px bold uppercase 0.12em ink-base.
                (Inline labely datových bloků - např. POS - jsou lehčí varianta:
                12px semibold 0.14em ink-mid.) */}
            {title && (
              <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink-base">
                {title}
              </h2>
            )}
            {hint && <p className="mt-1 text-[11.5px] text-ink-soft">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
