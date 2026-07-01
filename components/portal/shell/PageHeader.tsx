import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-10">
      <div className="flex flex-col gap-3">
        {eyebrow && (
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mid">
            <span
              aria-hidden="true"
              className="mr-3 inline-block h-px w-8 translate-y-[-3px] bg-ink-base/60 align-middle"
            />
            {eyebrow}
          </div>
        )}
        <h1 className="font-extrabold text-ink-base text-[clamp(1.85rem,3.4vw,2.6rem)] leading-[1.05] tracking-[-0.035em]">
          {title}
        </h1>
        {lede && (
          <p className="max-w-[60ch] text-[0.985rem] leading-relaxed text-ink-deep">
            {lede}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
