"use client";

import { useEffect } from "react";
import { X, AlertTriangle, ShieldCheck, Send } from "lucide-react";
import { BTN_PRIMARY } from "@/components/portal/ui/buttons";

// Potvrzovací modal před odesláním/schválením smlouvy z konceptu u typů, které
// nemají vlastní kontrolní seznam. Upozorní, že odesílatel přebírá odpovědnost
// za případné chyby ve smlouvě, a vyžádá si výslovné potvrzení.
export function ResponsibilityModal({
  name,
  mode,
  pending,
  onClose,
  onConfirm,
}: {
  // Jméno přihlášeného uživatele (odesílatel).
  name?: string;
  // "submit" = odeslání ke schválení (gated typy), "approve" = přímé schválení.
  mode: "submit" | "approve";
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const who = name?.trim() ? name.trim() : "odesílatel";
  const isSubmit = mode === "submit";

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
              {isSubmit ? "Odeslání ke schválení" : "Schválení smlouvy"}
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Potvrzení odpovědnosti
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

        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-[13px] leading-relaxed text-amber-900">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>
            {isSubmit ? "Odesláním ke schválení" : "Schválením"} přebíráš jako{" "}
            <strong className="font-semibold">{who}</strong> odpovědnost za
            případné chyby ve smlouvě. Zkontroluj prosím obsah, zadané údaje i
            identitu protistrany.
          </span>
        </div>

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
            onClick={onConfirm}
            disabled={pending}
            className={BTN_PRIMARY}
          >
            {isSubmit ? (
              <Send className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            )}
            {pending
              ? isSubmit
                ? "Odesílám…"
                : "Schvaluji…"
              : isSubmit
                ? "Odeslat ke schválení"
                : "Schválit smlouvu"}
          </button>
        </div>
      </div>
    </div>
  );
}
