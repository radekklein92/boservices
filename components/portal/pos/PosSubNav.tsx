"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Activity, Layers, LayoutDashboard, MapPin, Package, Receipt, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Podsekční navigace POS jako řada pilulkových tlačítek (jazyk portálu, ne taby).
// Vždy nahoře pod hlavičkou, aktivní položka vyplněná. Přenáší aktuální filtr
// (searchParams) do cíle, takže výběr/období zůstává.

const ITEMS: { seg: string; label: string; Icon: LucideIcon }[] = [
  { seg: "", label: "Přehled", Icon: LayoutDashboard },
  { seg: "zive", label: "Živě", Icon: Activity },
  { seg: "prodejny", label: "Prodejny", Icon: Store },
  { seg: "koncepty", label: "Koncepty", Icon: Layers },
  { seg: "mesta", label: "Města", Icon: MapPin },
  { seg: "produkty", label: "Produkty", Icon: Package },
  { seg: "uctenky", label: "Účtenky", Icon: Receipt },
];

const BASE = "/portal/pos";

export function PosSubNav() {
  const pathname = usePathname() ?? BASE;
  const sp = useSearchParams();
  const qs = sp?.toString() ? `?${sp.toString()}` : "";

  return (
    <nav className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 no-scrollbar" aria-label="Sekce Tržby">
      {ITEMS.map(({ seg, label, Icon }) => {
        const href = seg ? `${BASE}/${seg}` : BASE;
        const active = seg ? pathname.startsWith(`${BASE}/${seg}`) : pathname === BASE;
        return (
          <Link
            key={seg || "prehled"}
            href={`${href}${qs}`}
            aria-current={active ? "page" : undefined}
            className={[
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
              active
                ? "border-ink-base bg-ink-base text-paper"
                : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
