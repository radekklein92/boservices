"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { SidebarNav } from "./SidebarNav";

// Mobile top bar + slide-in drawer s portálovou navigací. Na desktop schované
// (Sidebar zůstává jako fixed left), na mobilu nahrazuje sidebar plně.
// Drawer se zavře sám při navigaci (usePathname change).
//
// UserMenu je server komponent s inline server action (signOut), nelze ho
// importovat do client komponentu - layout ho předává jako children prop.

export function MobileTopBar({
  isAdmin,
  userMenu,
  tasksBadge = 0,
}: {
  isAdmin: boolean;
  userMenu: ReactNode;
  tasksBadge?: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close drawer při změně cesty (po kliknutí na link).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Scroll-lock + Esc když je drawer otevřený.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Sticky top bar - jen na mobilu. */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-edge bg-paper px-4 md:hidden">
        <Link
          href="/portal"
          className="-m-1 inline-flex items-center gap-2 p-1"
          aria-label="Portál BOServices"
        >
          <Logo />
          <span className="border-l border-edge pl-2 text-[9px] font-medium uppercase tracking-[0.22em] text-ink-mid">
            Portál
          </span>
        </Link>
        <button
          type="button"
          aria-label={open ? "Zavřít menu" : "Otevřít menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-full border border-edge bg-paper text-ink-deep transition-colors hover:border-ink-base hover:bg-ink-base hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2"
        >
          {open ? (
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Menu className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Zavřít menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink-base/40 backdrop-blur-sm"
          />
          {/* Drawer panel - z pravé strany (víc moderní než zleva, není kolizní s back swipe) */}
          <aside className="absolute right-0 top-0 flex h-full w-[min(280px,85vw)] flex-col border-l border-edge bg-paper shadow-[-12px_0_40px_-12px_rgba(14,14,14,0.25)]">
            <div className="flex items-center justify-between px-4 pt-5 pb-3">
              <Link
                href="/portal"
                className="-m-1 inline-flex items-center gap-2 p-1"
                aria-label="Portál BOServices"
              >
                <Logo />
              </Link>
              <button
                type="button"
                aria-label="Zavřít menu"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
            <SidebarNav isAdmin={isAdmin} tasksBadge={tasksBadge} />
            <div className="border-t border-edge p-3">{userMenu}</div>
          </aside>
        </div>
      )}
    </>
  );
}
