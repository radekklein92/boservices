"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { BTN_PRIMARY } from "@/components/portal/ui/buttons";
import { formatCzk, parseClaimAmount } from "@/lib/portal/claims";
import {
  newManualClaim,
  type ClaimsOverlay,
  type Guarantor,
  type ManualClaim,
} from "@/lib/portal/claims-overlay";
import type { ContractClaimRef } from "@/lib/portal/assigned-claims";
import { CompanyPicker } from "./CompanyPicker";
import { GuarantorEditor } from "./GuarantorEditor";

// Počet firem, u kterých se pohledávka uplatní = primární dlužník + potvrzení
// ručitelé (každá firma max 1x). Zrcadlí logiku agregace.
function appliesCount(primary: string, guarantors: Guarantor[]): number {
  const set = new Set<string>();
  if (primary.trim()) set.add(primary.trim());
  for (const g of guarantors) {
    const c = g.company.trim();
    if (g.confirmedOverOneYear && c) set.add(c);
  }
  return set.size;
}

function confirmedCompanyCount(guarantors: Guarantor[]): number {
  return new Set(
    guarantors.filter((g) => g.confirmedOverOneYear && g.company.trim()).map((g) => g.company.trim()),
  ).size;
}

function cleanOverlay(d: ClaimsOverlay): ClaimsOverlay {
  const manualClaims = d.manualClaims
    .filter(
      (m) =>
        m.name.trim() ||
        m.amount.trim() ||
        m.primaryDebtor.trim() ||
        m.guarantors.some((g) => g.company.trim()),
    )
    .map((m) => ({
      ...m,
      name: m.name.trim(),
      primaryDebtor: m.primaryDebtor.trim(),
      note: (m.note ?? "").trim(),
      guarantors: m.guarantors.filter((g) => g.company.trim()),
    }));
  const guaranteesByClaimId: Record<string, Guarantor[]> = {};
  for (const [k, gs] of Object.entries(d.guaranteesByClaimId)) {
    const cleaned = gs.filter((g) => g.company.trim());
    if (cleaned.length) guaranteesByClaimId[k] = cleaned;
  }
  return { manualClaims, guaranteesByClaimId };
}

export function ClaimsOverlayEditor({
  contractClaims,
  companyOptions,
  initialOverlay,
  onSaved,
}: {
  contractClaims: ContractClaimRef[];
  companyOptions: string[];
  initialOverlay: ClaimsOverlay;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ClaimsOverlay>(initialOverlay);
  const [tab, setTab] = useState<"manual" | "cross">("manual");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function patchManual(id: string, patch: Partial<ManualClaim>) {
    setDraft((d) => ({
      ...d,
      manualClaims: d.manualClaims.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }
  function removeManual(id: string) {
    setDraft((d) => ({ ...d, manualClaims: d.manualClaims.filter((m) => m.id !== id) }));
  }
  function addManual() {
    setDraft((d) => ({ ...d, manualClaims: [...d.manualClaims, newManualClaim()] }));
  }
  function setClaimGuarantors(claimId: string, gs: Guarantor[]) {
    setDraft((d) => ({
      ...d,
      guaranteesByClaimId: { ...d.guaranteesByClaimId, [claimId]: gs },
    }));
  }
  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredContractClaims = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contractClaims;
    return contractClaims.filter(
      (c) =>
        c.title.toLowerCase().includes(q) || c.debtor.toLowerCase().includes(q),
    );
  }, [contractClaims, query]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/claims-overlay", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanOverlay(draft)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Uložení selhalo.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uložení selhalo.");
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Taby */}
      <div className="flex gap-1 px-6">
        <TabButton active={tab === "manual"} onClick={() => setTab("manual")}>
          Ruční pohledávky ({draft.manualClaims.length})
        </TabButton>
        <TabButton active={tab === "cross"} onClick={() => setTab("cross")}>
          Cross-ručení ({contractClaims.length})
        </TabButton>
      </div>

      {/* Obsah (scroll) */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-edge px-6 py-4">
        {tab === "manual" ? (
          <div className="flex flex-col gap-3">
            {draft.manualClaims.length === 0 && (
              <p className="rounded-xl border border-dashed border-edge bg-paper-warm/40 px-4 py-6 text-center text-[13px] text-ink-mid">
                Zatím žádné ruční pohledávky. Přidejte pohledávku mimo postoupené
                smlouvy - může se uplatnit u více firem (dlužník + ručitelé).
              </p>
            )}
            {draft.manualClaims.map((m) => {
              const k = appliesCount(m.primaryDebtor, m.guarantors);
              const per = parseClaimAmount(m.amount);
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-3 rounded-xl border border-edge bg-paper p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                      Pohledávka
                    </span>
                    <button
                      type="button"
                      onClick={() => removeManual(m.id)}
                      aria-label="Smazat pohledávku"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-edge text-ink-mid transition-colors hover:border-rose-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>

                  <Field label="Název pohledávky *">
                    <input
                      value={m.name}
                      onChange={(e) => patchManual(m.id, { name: e.target.value })}
                      placeholder="Např. Půjčka ze dne 1. 2. 2024"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Výše vč. DPH *">
                      <input
                        value={m.amount}
                        onChange={(e) => patchManual(m.id, { amount: e.target.value })}
                        placeholder="150 000"
                        inputMode="decimal"
                        className={INPUT_CLASS}
                      />
                    </Field>
                    <Field label="Primární dlužník *">
                      <CompanyPicker
                        value={m.primaryDebtor}
                        onChange={(v) => patchManual(m.id, { primaryDebtor: v })}
                        options={companyOptions}
                        placeholder="Dlužník"
                      />
                    </Field>
                  </div>

                  <Field label="Poznámka">
                    <input
                      value={m.note ?? ""}
                      onChange={(e) => patchManual(m.id, { note: e.target.value })}
                      placeholder="Volitelné"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                      Ručitelé (cross-uplatnění)
                    </span>
                    <GuarantorEditor
                      value={m.guarantors}
                      companyOptions={companyOptions}
                      onChange={(gs) => patchManual(m.id, { guarantors: gs })}
                    />
                  </div>

                  {per > 0 && k > 0 && (
                    <div className="rounded-lg bg-paper-warm/60 px-3 py-2 text-[12px] text-ink-deep">
                      Uplatní se u <strong>{k}</strong>{" "}
                      {k === 1 ? "firmy" : k < 5 ? "firem" : "firem"} · celkem{" "}
                      <strong>{formatCzk(per * k)}</strong>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={addManual}
              className="inline-flex h-10 w-fit items-center gap-1.5 rounded-full border border-edge px-4 text-[13px] font-semibold text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
              Přidat pohledávku
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[12.5px] leading-relaxed text-ink-mid">
              Ke každé pohledávce ze smluv lze přidat firmy, které za ni ručí.
              Pohledávka se pak uplatní (v plné výši) i u nich.
            </p>

            {contractClaims.length > 0 && (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Hledat podle názvu nebo dlužníka"
                  className="h-9 w-full rounded-lg border border-edge bg-paper pl-9 pr-3 text-[13px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
                />
              </div>
            )}

            {contractClaims.length === 0 && (
              <p className="rounded-xl border border-dashed border-edge bg-paper-warm/40 px-4 py-6 text-center text-[13px] text-ink-mid">
                Zatím žádné pohledávky z podepsaných smluv o postoupení.
              </p>
            )}

            {filteredContractClaims.map((c) => {
              const gs = draft.guaranteesByClaimId[c.id] ?? [];
              const count = confirmedCompanyCount(gs);
              const isOpen = expanded.has(c.id);
              return (
                <div key={c.id} className="rounded-xl border border-edge bg-paper">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(c.id)}
                    className="flex w-full items-start gap-3 p-3.5 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-ink-base">
                        {c.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-mid">
                        <span className="truncate">{c.debtor}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{formatCzk(c.amount)}</span>
                        {count > 0 && (
                          <span className="rounded-full bg-ink-base px-2 py-0.5 text-[10.5px] font-semibold text-paper">
                            + {count} {count === 1 ? "ručitel" : count < 5 ? "ručitelé" : "ručitelů"}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronDown
                      className={`mt-0.5 h-4 w-4 shrink-0 text-ink-mid transition-transform ${isOpen ? "rotate-180" : ""}`}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <div className="border-t border-edge p-3.5">
                      <GuarantorEditor
                        value={gs}
                        companyOptions={companyOptions}
                        onChange={(next) => setClaimGuarantors(c.id, next)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Patička */}
      <div className="flex items-center justify-between gap-3 border-t border-edge px-6 py-3.5">
        <div className="min-w-0 flex-1 truncate text-[12px] text-rose-600">
          {error}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={BTN_PRIMARY}
        >
          {saving ? "Ukládám…" : "Uložit změny"}
        </button>
      </div>
    </div>
  );
}

const INPUT_CLASS =
  "h-9 w-full rounded-lg border border-edge bg-paper px-3 text-[13px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-ink-mid">{label}</span>
      {children}
    </label>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative -mb-px border-b-2 px-1 pb-2.5 pt-1 text-[13px] font-semibold transition-colors",
        active
          ? "border-ink-base text-ink-base"
          : "border-transparent text-ink-mid hover:text-ink-base",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
