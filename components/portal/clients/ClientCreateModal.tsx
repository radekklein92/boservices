"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { ClientForm } from "./ClientForm";

export function ClientCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id?: string) => void;
}) {
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-10 backdrop-blur-sm md:py-16"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[760px] rounded-[28px] border border-edge bg-paper p-7 shadow-[0_24px_60px_-20px_rgba(14,14,14,0.35)] md:p-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              Nový klient
            </div>
            <h2 className="mt-2 font-extrabold text-ink-base text-[1.65rem] leading-[1.1] tracking-[-0.025em]">
              Přidat klienta
            </h2>
            <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-ink-deep">
              Stačí IČO — zbytek dotáhneme z ARES. Statutární zástupce a kontakt
              si pak doplníte sami.
            </p>
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <ClientForm
          variant="modal"
          mode={{
            kind: "create",
            onSuccess: (id) => onCreated(id),
            onCancel: onClose,
          }}
        />
      </div>
    </div>
  );
}
