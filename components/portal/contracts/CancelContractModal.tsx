"use client";

import { useEffect, useState } from "react";
import { X, Ban, RotateCcw } from "lucide-react";

// Potvrzovací modal pro zrušení smlouvy (klient odstoupil) / její obnovení.
// Zrušení nabízí volitelný důvod; obě akce vyžadují potvrzení.
export function CancelContractModal({
  mode,
  clientName,
  pending,
  onClose,
  onConfirm,
}: {
  mode: "cancel" | "restore";
  clientName: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const isCancel = mode === "cancel";

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
      <div className="relative w-full max-w-[520px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              Správa smlouvy
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              {isCancel ? "Označit smlouvu jako zrušenou?" : "Obnovit zrušenou smlouvu?"}
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

        {isCancel ? (
          <>
            <p className="mb-4 text-[13px] leading-relaxed text-ink-mid">
              Pro případ, že klient od smlouvy{" "}
              <strong className="text-ink-deep">{clientName}</strong> odstoupil.
              Smlouva se přestane počítat do provizí i do čísel na dashboardu.
              Akci lze kdykoli vrátit zpět.
            </p>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-mid">
              Důvod (volitelné)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              maxLength={500}
              placeholder="Např. klient odstoupil od smlouvy ke dni…"
              className="w-full resize-y rounded-xl border border-edge bg-paper px-4 py-3 text-[13.5px] leading-relaxed text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
            />
          </>
        ) : (
          <p className="mb-2 text-[13px] leading-relaxed text-ink-mid">
            Smlouva <strong className="text-ink-deep">{clientName}</strong> se vrátí
            do stavu před zrušením a začne se zase počítat do provizí i na
            dashboardu.
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-edge pt-5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full px-4 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base"
          >
            Zpět
          </button>
          {isCancel ? (
            <button
              type="button"
              onClick={() => onConfirm(reason.trim() || undefined)}
              disabled={pending}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-red-600 bg-red-600 px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
            >
              <Ban className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {pending ? "Ruším…" : "Označit jako zrušenou"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConfirm()}
              disabled={pending}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {pending ? "Obnovuji…" : "Obnovit smlouvu"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
