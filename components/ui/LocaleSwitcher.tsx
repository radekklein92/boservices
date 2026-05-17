"use client";

import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type Variant = "light" | "dark";

const LABELS: Record<string, string> = {
  cs: "CS",
  en: "EN",
};

export function LocaleSwitcher({ variant = "light" }: { variant?: Variant }) {
  const current = useLocale();
  const pathname = usePathname() ?? "/";
  const cleanPath =
    routing.locales.reduce<string>(
      (acc, l) => acc.replace(new RegExp(`^/${l}(?=/|$)`), ""),
      pathname,
    ) || "/";

  const baseColor =
    variant === "dark" ? "text-paper/55 hover:text-paper" : "text-ink-mid hover:text-ink-base";
  const activeColor = variant === "dark" ? "text-paper" : "text-ink-base";
  const divider = variant === "dark" ? "bg-paper/20" : "bg-ink-soft/60";

  return (
    <div
      className="inline-flex items-center gap-2 text-[12px] font-medium tracking-[0.14em]"
      aria-label="Language switcher"
    >
      {routing.locales.map((l, i) => {
        const isActive = l === current;
        return (
          <span key={l} className="inline-flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className={`block h-3 w-px ${divider}`} />
            )}
            <Link
              href={cleanPath}
              locale={l}
              prefetch={false}
              aria-current={isActive ? "true" : undefined}
              className={[
                "transition-colors duration-200",
                isActive ? activeColor : baseColor,
                isActive ? "" : "cursor-pointer",
              ].join(" ")}
            >
              {LABELS[l] ?? l.toUpperCase()}
            </Link>
          </span>
        );
      })}
    </div>
  );
}
