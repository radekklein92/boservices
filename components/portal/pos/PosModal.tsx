"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

// Modal pro intercepting route (@modal). Otevírá se měkkou navigací ze žebříčku,
// zavře přes backdrop / Esc / křížek -> router.back() (vrátí na žebříček, zmizí
// intercept). Přímý odkaz / refresh intercept neaktivuje -> plná stránka detailu.
export function PosModal({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const close = () => router.back();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 p-4 backdrop-blur-[2px] sm:p-8"
      onClick={close}
      role="presentation"
    >
      <div
        className="relative my-auto w-full max-w-[920px] rounded-2xl border border-edge bg-paper shadow-[0_24px_70px_-20px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-edge bg-paper/95 px-5 py-3.5 backdrop-blur">
          <h2 className="min-w-0 truncate text-[16px] font-semibold text-ink-base">{title}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Zavřít"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
