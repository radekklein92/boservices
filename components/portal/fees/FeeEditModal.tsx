"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { FeeTermsEditor } from "@/components/portal/contracts/FeeTermsEditor";
import type { ContractType } from "@/lib/portal/contract-types";
import type { ContractFeeTerms } from "@/lib/portal/contract-fee-terms";

// Modal pro úpravu všech poplatkových period jedné smlouvy z centrální stránky
// Poplatky. Zápis přes sdílený FeeTermsEditor (PUT /fee-terms).
export function FeeEditModal({
  contractId,
  contractType,
  initial,
  locationName,
  contractLabel,
  onClose,
  onSaved,
}: {
  contractId: string;
  contractType: ContractType;
  initial: ContractFeeTerms | null;
  locationName: string;
  contractLabel: string;
  onClose: () => void;
  onSaved: () => void;
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-8 backdrop-blur-sm md:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[720px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              {locationName} · {contractLabel}
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Úprava poplatků
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-mid">
              Upraví všechny periody této smlouvy. Změna se projeví i na detailu lokality a klienta.
            </p>
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

        <FeeTermsEditor
          contractId={contractId}
          contractType={contractType}
          initial={initial}
          onClose={onClose}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}
