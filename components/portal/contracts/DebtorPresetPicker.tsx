"use client";

import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { DEBTOR_PRESETS, type DebtorPreset } from "@/lib/portal/debtor-presets";

export interface DebtorFillPayload {
  debtorName: string;
  debtorIco: string;
  debtorStreet: string;
  debtorCity: string;
  debtorZip: string;
}

export function DebtorPresetPicker({
  selectedIco,
  onFill,
}: {
  selectedIco?: string;
  onFill: (payload: DebtorFillPayload) => void;
}) {
  const [pendingIco, setPendingIco] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function pick(preset: DebtorPreset) {
    setPendingIco(preset.ico);
    setError(null);
    try {
      const res = await fetch("/api/portal/clients/ares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ico: preset.ico }),
      });
      const data = await res.json();
      if (!data.ok) {
        // Když ARES selže, alespoň vyplníme co máme z presetu.
        onFill({
          debtorName: `${preset.label} s.r.o.`,
          debtorIco: preset.ico,
          debtorStreet: "",
          debtorCity: "",
          debtorZip: "",
        });
        setError(
          data.error
            ? `Nepodařilo se načíst z ARES (${data.error}). Doplňte zbytek ručně.`
            : "ARES nedostupný. Doplňte zbytek ručně.",
        );
        return;
      }
      const r = data.result;
      onFill({
        debtorName: r.companyName,
        debtorIco: r.ico,
        debtorStreet: r.address.street ?? "",
        debtorCity: r.address.city ?? "",
        debtorZip: r.address.zip ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba spojení.");
    } finally {
      setPendingIco(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {DEBTOR_PRESETS.map((preset) => {
          const active = selectedIco === preset.ico;
          const loading = pendingIco === preset.ico;
          return (
            <button
              key={preset.ico}
              type="button"
              onClick={() => pick(preset)}
              disabled={loading}
              aria-pressed={active}
              className={[
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-all disabled:opacity-60",
                active
                  ? "border-ink-base bg-ink-base text-paper"
                  : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
              ].join(" ")}
            >
              {loading && (
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-soft" />
              )}
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label="Přidat dalšího dlužníka"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-edge bg-paper px-3 text-[12px] font-medium text-ink-mid transition-colors hover:border-ink-base hover:text-ink-base"
        >
          <Plus className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
          Jiná firma
        </button>
      </div>
      {error && (
        <p className="text-[11.5px] text-ink-deep" role="alert">
          {error}
        </p>
      )}
      {modalOpen && (
        <AresLookupModal
          onClose={() => setModalOpen(false)}
          onFilled={(payload) => {
            onFill(payload);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AresLookupModal({
  onClose,
  onFilled,
}: {
  onClose: () => void;
  onFilled: (payload: DebtorFillPayload) => void;
}) {
  const [ico, setIco] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function lookup() {
    const trimmed = ico.replace(/\s+/g, "");
    if (!trimmed) {
      setError("Zadejte IČO.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/clients/ares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ico: trimmed }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Firma se v ARES nenašla.");
        return;
      }
      const r = data.result;
      onFilled({
        debtorName: r.companyName,
        debtorIco: r.ico,
        debtorStreet: r.address.street ?? "",
        debtorCity: r.address.city ?? "",
        debtorZip: r.address.zip ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba spojení.");
    } finally {
      setPending(false);
    }
  }

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
              Dlužník mimo presety
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Vyhledat firmu v ARES
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            lookup();
          }}
          className="flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
              IČO
            </span>
            <input
              type="text"
              autoFocus
              value={ico}
              onChange={(e) => setIco(e.target.value)}
              placeholder="např. 24520039"
              className="h-11 rounded-lg border border-edge bg-paper px-3 text-[14px] tabular-nums text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
            />
            <span className="text-[11px] text-ink-mid">
              Po vyhledání se obchodní jméno, ulice, obec a PSČ doplní automaticky.
            </span>
          </label>

          {error && (
            <div role="alert" className="text-[12.5px] text-ink-deep">
              {error}
            </div>
          )}

          <div className="mt-1 flex items-center justify-end gap-2 border-t border-edge pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-full px-4 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
            >
              <Search className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              {pending ? "Hledám…" : "Vyhledat a doplnit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
