"use client";

import { useEffect, useState } from "react";
import { X, PenLine, Gavel, Check, UserCheck } from "lucide-react";
import type { User } from "@/lib/portal/users-db";
import { signerFunctionLabel, signerRoleText } from "@/lib/portal/users-db";
import { KEEP_ORIGINAL_SIGNER } from "./signer-keep-original";

export function SignerPickerModal({
  currentSignerEmail,
  bulkCount,
  ndaMode = false,
  onClose,
  onPicked,
}: {
  currentSignerEmail?: string;
  // Pokud > 1, jde o hromadný výběr - zobrazíme informaci.
  bulkCount?: number;
  // NDA/DigiSign: nabídni kohokoliv s telefonem (ne jen Podepisující), role
  // se vezme dle funkce nebo „na základě plné moci". Bez „zachovat původního".
  ndaMode?: boolean;
  onClose: () => void;
  onPicked: (email: string) => Promise<void> | void;
}) {
  const [signers, setSigners] = useState<User[] | null>(null);
  const [selected, setSelected] = useState<string | null>(
    currentSignerEmail ?? null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // /api/portal/signers vrací jen seznam Podepisujících (dostupné
        // pro všechny přihlášené, nejen pro adminy - běžný user musí
        // pickovat signera u svých smluv stejně jako admin).
        const res = await fetch(
          ndaMode ? "/api/portal/signers?withPhone=1" : "/api/portal/signers",
          { cache: "no-store" },
        );
        const data = await res.json();
        if (cancelled) return;
        if (!data.ok) throw new Error(data.error || "Chyba");
        const list: User[] = Array.isArray(data.signers) ? data.signers : [];
        setSigners(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Chyba");
          setSigners([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirm() {
    if (!selected) return;
    setError(null);
    setPending(true);
    try {
      await onPicked(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
      setPending(false);
    }
  }

  const isBulk = (bulkCount ?? 1) > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-base/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[28px] border border-edge bg-paper shadow-[0_24px_60px_-20px_rgba(14,14,14,0.35)]">
        <div className="flex items-start justify-between gap-4 px-8 pt-8">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              {isBulk ? `Hromadný výběr · ${bulkCount} smluv` : "Výběr podepisujícího"}
            </div>
            <h2 className="mt-2 font-extrabold text-ink-base text-[1.5rem] leading-[1.1] tracking-[-0.025em]">
              Kdo to podepíše?
            </h2>
            <p className="mt-1.5 text-[13px] text-ink-mid">
              {isBulk
                ? "Stejný podepisující bude přiřazen ke všem označeným smlouvám."
                : ndaMode
                  ? "Vyber osobu, která NDA podepíše za BOServices (elektronicky přes DigiSign)."
                  : "Vyber osobu, která fyzicky podepíše smlouvu za BOServices."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {signers === null ? (
            <div className="py-12 text-center text-[13px] text-ink-mid">
              Načítám podepisující…
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {/* Zachovat původního podepisujícího - bez přepsání zástupce ve smlouvě.
                  U NDA (DigiSign) nedává smysl - podepisující je vždy konkrétní. */}
              {!ndaMode && (
              <li>
                <button
                  type="button"
                  onClick={() => setSelected(KEEP_ORIGINAL_SIGNER)}
                  aria-pressed={selected === KEEP_ORIGINAL_SIGNER}
                  className={[
                    "flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all duration-200",
                    selected === KEEP_ORIGINAL_SIGNER
                      ? "border-ink-base bg-ink-base text-paper"
                      : "border-dashed border-edge bg-paper text-ink-deep hover:border-ink-soft",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                      selected === KEEP_ORIGINAL_SIGNER
                        ? "bg-paper text-ink-base"
                        : "bg-edge-warm text-ink-mid",
                    ].join(" ")}
                  >
                    <UserCheck className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold tracking-[-0.01em]">
                      Zachovat původního podepisujícího
                    </span>
                    <span
                      className={`mt-0.5 block text-[11.5px] ${
                        selected === KEEP_ORIGINAL_SIGNER ? "text-paper/70" : "text-ink-mid"
                      }`}
                    >
                      Ponechá zástupce uvedeného ve smlouvě (nepřepíše se).
                    </span>
                  </span>
                  {selected === KEEP_ORIGINAL_SIGNER && (
                    <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                  )}
                </button>
              </li>
              )}

              {signers.length === 0 ? (
                <li className="py-8 text-center">
                  <PenLine
                    className="mx-auto h-10 w-10 text-ink-soft"
                    strokeWidth={1.25}
                    aria-hidden="true"
                  />
                  <p className="mt-3 text-[13px] text-ink-mid">
                    {ndaMode
                      ? "Žádný uživatel nemá vyplněný telefon. Doplň ho v sekci Uživatelé."
                      : "Zatím nemáš žádné Podepisující. Vytvoř je v sekci Uživatelé."}
                  </p>
                </li>
              ) : (
                signers.map((s) => {
                const active = selected === s.email;
                const displayName = s.signerDisplayName?.trim() || s.name;
                // NDA: role dle funkce, jinak „na základě plné moci"; + telefon.
                // Ostatní typy: jen funkce Podepisujícího.
                const subtitle = ndaMode
                  ? `${signerRoleText(s) || "na základě plné moci"} · ${s.email}`
                  : `${signerFunctionLabel(s.signerFunction!)} · ${s.email}`;
                return (
                  <li key={s.email}>
                    <button
                      type="button"
                      onClick={() => setSelected(s.email)}
                      className={[
                        "flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all duration-200",
                        active
                          ? "border-ink-base bg-ink-base text-paper"
                          : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
                      ].join(" ")}
                      aria-pressed={active}
                    >
                      <span
                        className={[
                          "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                          active ? "bg-paper text-ink-base" : "bg-edge-warm text-ink-mid",
                        ].join(" ")}
                      >
                        <Gavel className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold tracking-[-0.01em]">
                          {displayName}
                        </span>
                        <span
                          className={`mt-0.5 block truncate text-[11.5px] ${
                            active ? "text-paper/70" : "text-ink-mid"
                          }`}
                        >
                          {subtitle}
                        </span>
                      </span>
                      {active && (
                        <Check
                          className="h-4 w-4 shrink-0"
                          strokeWidth={2.5}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                );
                })
              )}
            </ul>
          )}
        </div>

        {error && (
          <div className="px-8 pb-4 text-[13px] text-ink-deep" role="alert">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-edge px-8 py-5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full px-5 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base"
          >
            Zrušit
          </button>
          <button
            type="button"
            disabled={!selected || pending}
            onClick={confirm}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
          >
            {pending
              ? "Přiřazuji…"
              : isBulk
                ? "Přiřadit ke všem"
                : "Přiřadit"}
          </button>
        </div>
      </div>
    </div>
  );
}
