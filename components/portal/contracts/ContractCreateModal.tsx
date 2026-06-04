"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, X } from "lucide-react";
import type { Client } from "@/lib/portal/clients-db";
import {
  CONTRACT_TYPES_PICKABLE,
  CONTRACT_TYPE_META,
  getVariantsForType,
  getVariantMeta,
  getDefaultVariantForType,
  hasVariants,
  isApprovalGated,
  type ContractType,
} from "@/lib/portal/contract-types";
import { ClientCombobox } from "@/components/portal/ui/ClientCombobox";
import {
  LocationCombobox,
  type LocationPickItem,
} from "@/components/portal/ui/LocationCombobox";
import {
  APPROVAL_KEY,
  APPROVAL_KEY_INTRO,
  evaluateApproval,
  LEASE_HOLDER_LABEL,
  NEW_MODE_LABEL,
} from "@/lib/portal/contract-approval";
import {
  CATEGORY_LABEL,
  CATEGORY_STYLE,
  CHIP_BASE,
} from "@/components/portal/locations/locations-shared";
import type {
  LeaseStatus,
  LocationCategory,
  LocationMode,
} from "@/lib/portal/locations-db";

export function ContractCreateModal({
  clients,
  onClose,
  onCreated,
}: {
  clients: Client[];
  onClose: () => void;
  onCreated: (id?: string) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [type, setType] = useState<ContractType>("franchise");
  // Variant per type; přepnutí typu může změnit povolené varianty, takže když
  // user přehodí na withdrawal, vezme se default A. Pro typy bez variant undefined.
  const [variant, setVariant] = useState<string | undefined>(
    getDefaultVariantForType("franchise"),
  );
  // Franšízový poplatek (%) - AB: volitelné 0-8 (default 8), B: pevně 8
  const [franchiseFeePercent, setFranchiseFeePercent] = useState<number>(8);
  // Lokalita - povinná u typů posuzovaných podle lokality (isApprovalGated).
  const [locationId, setLocationId] = useState("");
  const [locationItem, setLocationItem] = useState<LocationPickItem | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveFeePercent = variant === "B" ? 8 : franchiseFeePercent;
  const availableVariants = getVariantsForType(type);
  const gated = isApprovalGated(type);

  // Náhled rozhodnutí podle klíče (jen orientačně - závazně se vyhodnotí až
  // při „Odeslat ke schválení"). Čerstvá smlouva má default šablonu, takže
  // odměnu bereme jako standardní (15 000 / 30 000) a poplatek dle volby.
  const preview =
    gated && locationItem
      ? evaluateApproval({
          contractType: type,
          newMode: locationItem.newMode as LocationMode | null,
          leaseStatus: locationItem.leaseStatus as LeaseStatus,
          newco: locationItem.newco,
          franchiseFeePercent: type === "franchise" ? effectiveFeePercent : null,
          operatingFeeAmount:
            type === "cooperation" ? 15000 : type === "operation" ? 30000 : null,
        })
      : null;

  function changeType(next: ContractType) {
    setType(next);
    // Reset variant na default toho typu (jinak by zůstala varianta z předchozího
    // typu, která pro nový typ nemusí být platná).
    setVariant(getDefaultVariantForType(next));
  }

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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/portal/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          type,
          ...(hasVariants(type) ? { variant } : {}),
          ...(type === "franchise"
            ? { franchiseFeePercent: effectiveFeePercent }
            : {}),
          ...(gated ? { locationId } : {}),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      onCreated(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
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
      <div className="relative w-full max-w-[560px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              Nová smlouva
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Vyberte klienta a typ
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

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
              Klient
            </span>
            <ClientCombobox
              clients={clients}
              value={clientId}
              onChange={setClientId}
              autoFocus
            />
            <span className="mt-0.5 text-[11px] text-ink-mid">
              Hledejte podle obchodního jména, IČO, města nebo zástupce.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
              Typ smlouvy
            </span>
            <div className="flex flex-col gap-1.5">
              {CONTRACT_TYPES_PICKABLE.map((t) => {
                const meta = CONTRACT_TYPE_META[t];
                const active = t === type;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => changeType(t)}
                    className={[
                      "flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-all",
                      active
                        ? "border-ink-base bg-ink-base text-paper"
                        : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        active
                          ? "border-paper bg-paper"
                          : "border-ink-soft",
                      ].join(" ")}
                    >
                      {active && (
                        <span className="h-1.5 w-1.5 rounded-full bg-ink-base" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold tracking-[-0.01em]">
                        {meta.fullName}
                      </span>
                      <span
                        className={`mt-0.5 block text-[11.5px] leading-snug ${
                          active ? "text-paper/65" : "text-ink-mid"
                        }`}
                      >
                        {meta.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {hasVariants(type) && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
                Varianta
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {availableVariants.map((v) => {
                  const meta = getVariantMeta(type, v);
                  if (!meta) return null;
                  const active = v === variant;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVariant(v)}
                      className={[
                        "flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-all",
                        active
                          ? "border-ink-base bg-ink-base text-paper"
                          : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
                      ].join(" ")}
                    >
                      <span className="text-[12.5px] font-semibold tracking-[-0.01em]">
                        {meta.label}
                      </span>
                      <span
                        className={`text-[11px] leading-snug ${
                          active ? "text-paper/65" : "text-ink-mid"
                        }`}
                      >
                        {meta.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {type === "franchise" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
                Franšízový a marketingový poplatek
              </span>
              {variant === "AB" ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Array.from({ length: 6 }, (_, i) => i + 3).map((pct) => {
                      const active = pct === franchiseFeePercent;
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setFranchiseFeePercent(pct)}
                          aria-pressed={active}
                          className={[
                            "inline-flex h-9 min-w-[44px] items-center justify-center rounded-full border px-3 text-[12.5px] font-semibold tabular-nums transition-all",
                            active
                              ? "border-ink-base bg-ink-base text-paper"
                              : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
                          ].join(" ")}
                        >
                          {pct} %
                        </button>
                      );
                    })}
                  </div>
                  <span className="mt-0.5 text-[11px] text-ink-mid">
                    Zvolte celé procento 3–8. Hodnota se vloží do čl. VI odst. 2.
                  </span>
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-edge bg-paper-warm px-3 py-2.5">
                  <span className="inline-flex h-7 items-center rounded-full bg-ink-base px-3 text-[12px] font-semibold tabular-nums text-paper">
                    8 %
                  </span>
                  <span className="text-[11.5px] text-ink-mid">
                    Varianta B má franšízový poplatek pevně daný (8 %).
                  </span>
                </div>
              )}
            </div>
          )}

          {gated && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
                Lokalita
              </span>
              <LocationCombobox
                value={locationId}
                onChange={(id, item) => {
                  setLocationId(id);
                  setLocationItem(item);
                }}
              />
              {locationItem ? (
                <div className="mt-1 flex flex-col gap-2 rounded-lg border border-edge bg-paper-warm px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {locationItem.category && (
                      <span
                        className={`${CHIP_BASE} ${CATEGORY_STYLE[locationItem.category as LocationCategory]}`}
                      >
                        {CATEGORY_LABEL[locationItem.category as LocationCategory]}
                      </span>
                    )}
                    <span className="text-[12px] text-ink-mid">
                      Nájem{" "}
                      <span className="font-medium text-ink-base">
                        {LEASE_HOLDER_LABEL[locationItem.leaseStatus as LeaseStatus]}
                      </span>
                    </span>
                    <span className="text-[12px] text-ink-mid">
                      · Nový režim{" "}
                      <span className="font-medium text-ink-base">
                        {locationItem.newMode
                          ? NEW_MODE_LABEL[locationItem.newMode as LocationMode]
                          : "neuvedeno"}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 text-[12px] leading-snug">
                    {preview?.auto ? (
                      <span className="text-emerald-700">
                        Po odeslání bude <strong>automaticky schváleno</strong>.
                      </span>
                    ) : (
                      <>
                        <span className="text-amber-700">
                          Po odeslání <strong>půjde ke schvalovatelům</strong>:
                        </span>
                        <ul className="flex flex-col gap-1">
                          {preview?.reasons.map((r, i) => (
                            <li
                              key={`${r.code}-${i}`}
                              className="flex gap-2 text-amber-700"
                            >
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                              <span>{r.label}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>

                  {/* Rozbalovací klíč - jak se o schválení rozhoduje. */}
                  <div className="border-t border-edge pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRules((v) => !v)}
                      aria-expanded={showRules}
                      className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${showRules ? "rotate-180" : ""}`}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      {showRules ? "Skrýt pravidla" : "Jak se o schválení rozhoduje?"}
                    </button>
                    {showRules && (
                      <div className="mt-2 flex flex-col gap-2">
                        <p className="text-[11.5px] leading-snug text-ink-mid">
                          {APPROVAL_KEY_INTRO}
                        </p>
                        <ul className="flex flex-col gap-1.5">
                          {APPROVAL_KEY.map((text) => (
                            <li
                              key={text}
                              className="flex gap-2 text-[11.5px] leading-snug text-ink-deep"
                            >
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-soft" aria-hidden="true" />
                              <span>{text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <span className="mt-0.5 text-[11px] text-ink-mid">
                  Vyberte lokalitu, které se smlouva týká. Podle její kategorie,
                  nájmu a nového režimu se rozhodne o schválení.
                </span>
              )}
            </div>
          )}

          {error && (
            <div role="alert" className="text-[12.5px] text-ink-deep">
              {error}
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-2 border-t border-edge pt-5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-full px-4 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={pending || !clientId || (gated && !locationId)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
            >
              {pending ? "Vytvářím…" : "Vytvořit smlouvu"}
              {!pending && <span aria-hidden="true">→</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
