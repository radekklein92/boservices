"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Pod-navigace POS sekce. Aktivní dle pathname. Přenáší aktuální filtr
// (searchParams) do odkazů, takže přepnutí tabu zachová rozsah/období/měnu.
const TABS: { href: string; label: string }[] = [
  { href: "/portal/pos", label: "Přehled" },
  { href: "/portal/pos/produkty", label: "Produkty" },
  { href: "/portal/pos/uctenky", label: "Účtenky" },
  { href: "/portal/pos/reporty", label: "Reporty" },
];

export function PosTabs() {
  const pathname = usePathname() ?? "/portal/pos";
  const sp = useSearchParams();
  const qs = sp?.toString();
  const suffix = qs ? `?${qs}` : "";

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-edge">
      {TABS.map((t) => {
        const active =
          t.href === "/portal/pos"
            ? pathname === "/portal/pos"
            : pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={`${t.href}${suffix}`}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
              active
                ? "border-ink-base text-ink-base"
                : "border-transparent text-ink-mid hover:text-ink-base"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
