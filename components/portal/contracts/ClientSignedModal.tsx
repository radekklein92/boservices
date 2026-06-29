"use client";

import { useEffect, useState } from "react";
import { X, PenLine } from "lucide-react";
import { BTN_PRIMARY_MODAL } from "@/components/portal/ui/buttons";

// Potvrzovací modal pro „Podepsáno klientem". Datum podpisu je vždy předvyplněné
// na dnešek (lze přepsat) - od něj se počítají poplatky (účinnost/fakturace).
export function ClientSignedModal({
  defaultDate,
  onClose,
  onConfirm,
  pending,
}: {
  defaultDate: string; // ISO YYYY-MM-DD (dnes)
  onClose: () => void;
  onConfirm: (signedAt: string) => void;
  pending?: boolean;
}) {
  const [date, setDate] = useState(defaultDate);

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
      <div className="relative w-full max-w-[480px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              Podpis klientem
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Označit jako Podepsáno klientem
            </h2>
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <p className="mb-3 text-[13px] leading-relaxed text-ink-mid">
          Zadej datum, kdy klient podepsal - od něj se počítají poplatky (účinnost a fakturace).
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft">
            Datum podpisu klientem
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 rounded-xl border border-edge bg-paper px-3 text-[13.5px] text-ink-base outline-none transition-colors focus:border-ink-base"
          />
        </label>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-edge pt-5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full px-4 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => onConfirm(date)}
            disabled={pending || !date}
            className={BTN_PRIMARY_MODAL}
          >
            <PenLine className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {pending ? "Označuji…" : "Označit Podepsáno klientem"}
          </button>
        </div>
      </div>
    </div>
  );
}
