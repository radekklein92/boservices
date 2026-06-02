"use client";

import { useEffect, useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import { BTN_PRIMARY } from "@/components/portal/ui/buttons";

// Modal pro schválení smlouvy superadminem - vyžaduje podrobnou poznámku
// (proč, kdy a kým byla smlouva schválena).
export function ApprovalNoteModal({
  onClose,
  onConfirm,
  pending,
}: {
  onClose: () => void;
  onConfirm: (note: string) => void;
  pending?: boolean;
}) {
  const [note, setNote] = useState("");
  const trimmed = note.trim();

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
              Schválení superadminem
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Schválit smlouvu mimo standardní proces
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
          Uveďte podrobnou poznámku - <strong className="text-ink-deep">proč, kdy a kým</strong>{" "}
          byla smlouva schválena (např. „schváleno telefonicky 2. 6. 2026 10:55, Jan Novák").
        </p>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          autoFocus
          maxLength={500}
          placeholder="Proč, kdy a kým byla smlouva schválena…"
          className="w-full resize-y rounded-xl border border-edge bg-paper px-4 py-3 text-[13.5px] leading-relaxed text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
        />

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
            onClick={() => onConfirm(trimmed)}
            disabled={pending || trimmed.length === 0}
            className={BTN_PRIMARY}
          >
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {pending ? "Schvaluji…" : "Schválit s poznámkou"}
          </button>
        </div>
      </div>
    </div>
  );
}
