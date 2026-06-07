"use client";

import { useEffect, useState } from "react";
import { Check, Lock, LockOpen, X } from "lucide-react";
import type { Contract } from "@/lib/portal/contracts-db";

// Modal pro uzamčení konceptu: výběr uživatelů, kteří (vedle mě) smí upravovat.
// Sdílený detailem smlouvy i přehledem smluv.
export function LockUsersModal({
  editLock,
  currentUserEmail,
  userOptions,
  busy,
  onConfirm,
  onUnlock,
  onClose,
}: {
  editLock: Contract["editLock"];
  currentUserEmail: string;
  userOptions: { email: string; name: string }[];
  busy: boolean;
  onConfirm: (allowed: string[]) => void;
  onUnlock: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(editLock?.allowed ?? []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Sebe ze seznamu vynecháme (zamykatel má přístup vždy).
  const others = userOptions.filter(
    (u) => u.email.toLowerCase() !== currentUserEmail.toLowerCase(),
  );
  const toggle = (email: string) =>
    setSelected((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-base/40 px-4 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-[480px] flex-col rounded-2xl border border-edge bg-paper shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)]">
        <div className="flex items-start justify-between gap-3 p-6 pb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-soft">
              <Lock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Zámek úprav
            </div>
            <h3 className="mt-1 text-[17px] font-bold leading-[1.2] tracking-[-0.02em] text-ink-base">
              Uzamknout koncept k úpravám
            </h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-mid">
              Upravovat budete moct vy a níže vybraní uživatelé. Ostatní si smlouvu
              jen prohlédnou.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-soft"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-soft">
            Smí upravovat i
          </div>
          <div className="mt-2 flex flex-col">
            {others.length === 0 ? (
              <p className="py-3 text-[12.5px] text-ink-mid">Žádní další uživatelé.</p>
            ) : (
              others.map((u) => {
                const active = selected.includes(u.email);
                return (
                  <button
                    key={u.email}
                    type="button"
                    onClick={() => toggle(u.email)}
                    className="flex items-center justify-between gap-3 border-b border-edge py-2.5 text-left last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] text-ink-base">{u.name || u.email}</span>
                      <span className="block truncate text-[11px] text-ink-mid">{u.email}</span>
                    </span>
                    <span
                      className={[
                        "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                        active ? "border-ink-base bg-ink-base text-paper" : "border-edge bg-paper",
                      ].join(" ")}
                    >
                      {active && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-edge p-4">
          {editLock ? (
            <button
              type="button"
              onClick={onUnlock}
              disabled={busy}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-edge px-4 text-[13px] font-medium text-ink-deep transition-colors hover:border-ink-base disabled:opacity-50"
            >
              <LockOpen className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Odemknout
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-full border border-edge px-4 text-[13px] font-medium text-ink-deep transition-colors hover:border-ink-base"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selected)}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {editLock ? "Uložit zámek" : "Uzamknout"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
