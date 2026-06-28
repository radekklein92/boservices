"use client";

import { useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { BTN_PRIMARY, BTN_OUTLINE, BTN_ICON, BTN_ROW } from "@/components/portal/ui/buttons";
import {
  AMOUNT_PERIOD_LABEL,
  FEE_KIND_LABEL,
  type AmountPeriod,
  type ContractFeeTerms,
  type FeeKind,
  type FeePeriod,
} from "@/lib/portal/contract-fee-terms";
import type { ContractType } from "@/lib/portal/contract-types";

const CURRENCIES = ["CZK", "EUR", "PLN"] as const;
const KINDS: FeeKind[] = ["franchise", "marketing", "operation", "cooperation", "other"];

const FIELD =
  "w-full rounded-lg border border-edge bg-paper px-3 py-2 text-[13px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base";
const LABEL = "block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft";

type DraftPeriod = FeePeriod & { mode: "percent" | "amount" };

function toDraftPeriod(p: FeePeriod): DraftPeriod {
  return { ...p, mode: p.amount > 0 && p.percent === 0 ? "amount" : "percent" };
}

function emptyPeriod(mode: "percent" | "amount"): DraftPeriod {
  return {
    id: globalThis.crypto.randomUUID(),
    label: "",
    kind: mode === "amount" ? "operation" : "franchise",
    percent: 0,
    percentBase: "",
    amount: 0,
    amountPeriod: mode === "amount" ? "monthly" : "none",
    from: "",
    to: "",
    relativeFromMonth: 0,
    relativeToMonth: 0,
    note: "",
    mode,
  };
}

// Editor poplatkových period jedné smlouvy. Zápis přes PUT /fee-terms (write-through
// na contract.feeTerms). Sdílený mezi detailem lokality (inline) a stránkou Poplatky
// (modal). Nemění obsah smlouvy (html), jen feeTerms. onSaved řeší refresh volající.
export function FeeTermsEditor({
  contractId,
  contractType,
  initial,
  onClose,
  onSaved,
}: {
  contractId: string;
  contractType: ContractType;
  initial: ContractFeeTerms | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? "");
  const [invoicingStartsFrom, setInvoicingStartsFrom] = useState(
    initial?.invoicingStartsFrom ?? "",
  );
  const [termEndsAt, setTermEndsAt] = useState(initial?.termEndsAt ?? "");
  const [currency, setCurrency] = useState(initial?.currency || "CZK");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [periods, setPeriods] = useState<DraftPeriod[]>(
    initial?.periods.map(toDraftPeriod) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFranchise = contractType === "franchise";

  function patchPeriod(i: number, patch: Partial<DraftPeriod>) {
    setPeriods((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payloadPeriods: FeePeriod[] = periods.map((p) => {
        const isPercent = p.mode === "percent";
        return {
          id: p.id,
          label: p.label,
          kind: p.kind,
          percent: isPercent ? Number(p.percent) || 0 : 0,
          percentBase: p.percentBase,
          amount: isPercent ? 0 : Number(p.amount) || 0,
          amountPeriod: isPercent ? "none" : p.amountPeriod === "none" ? "monthly" : p.amountPeriod,
          from: p.from,
          to: p.to,
          relativeFromMonth: p.relativeFromMonth,
          relativeToMonth: p.relativeToMonth,
          note: p.note,
        };
      });
      const res = await fetch(`/api/portal/contracts/${contractId}/fee-terms`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          effectiveFrom,
          invoicingStartsFrom,
          termEndsAt: isFranchise ? termEndsAt : "",
          currency,
          summary,
          periods: payloadPeriods,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Uložení selhalo.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {periods.map((p, i) => (
          <div key={p.id} className="rounded-xl border border-edge bg-paper-warm p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-edge bg-paper p-0.5 text-[11.5px]">
                <button
                  type="button"
                  onClick={() => patchPeriod(i, { mode: "percent" })}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${p.mode === "percent" ? "bg-ink-base text-paper" : "text-ink-mid"}`}
                >
                  Procento
                </button>
                <button
                  type="button"
                  onClick={() => patchPeriod(i, { mode: "amount" })}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${p.mode === "amount" ? "bg-ink-base text-paper" : "text-ink-mid"}`}
                >
                  Pevná částka
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPeriods((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Smazat periodu"
                className={BTN_ICON}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={LABEL}>Název</label>
                <input
                  value={p.label}
                  onChange={(e) => patchPeriod(i, { label: e.target.value })}
                  placeholder={FEE_KIND_LABEL[p.kind]}
                  className={`${FIELD} mt-1`}
                />
              </div>

              <div>
                <label className={LABEL}>Druh</label>
                <select
                  value={p.kind}
                  onChange={(e) => patchPeriod(i, { kind: e.target.value as FeeKind })}
                  className={`${FIELD} mt-1`}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {FEE_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>

              {p.mode === "percent" ? (
                <div>
                  <label className={LABEL}>Sazba (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={p.percent || ""}
                    onChange={(e) => patchPeriod(i, { percent: Number(e.target.value) })}
                    className={`${FIELD} mt-1`}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className={LABEL}>Částka (Kč bez DPH)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={p.amount || ""}
                      onChange={(e) => patchPeriod(i, { amount: Number(e.target.value) })}
                      className={`${FIELD} mt-1`}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Perioda</label>
                    <select
                      value={p.amountPeriod === "none" ? "monthly" : p.amountPeriod}
                      onChange={(e) => patchPeriod(i, { amountPeriod: e.target.value as AmountPeriod })}
                      className={`${FIELD} mt-1`}
                    >
                      <option value="monthly">{AMOUNT_PERIOD_LABEL.monthly}</option>
                      <option value="yearly">{AMOUNT_PERIOD_LABEL.yearly}</option>
                      <option value="one-time">{AMOUNT_PERIOD_LABEL["one-time"]}</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className={LABEL}>Platí od</label>
                <input
                  type="date"
                  value={p.from}
                  onChange={(e) => patchPeriod(i, { from: e.target.value })}
                  className={`${FIELD} mt-1`}
                />
              </div>
              <div>
                <label className={LABEL}>Platí do</label>
                <input
                  type="date"
                  value={p.to}
                  onChange={(e) => patchPeriod(i, { to: e.target.value })}
                  className={`${FIELD} mt-1`}
                />
              </div>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPeriods((prev) => [...prev, emptyPeriod("percent")])}
            className={BTN_ROW}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            Procentuální sazba
          </button>
          <button
            type="button"
            onClick={() => setPeriods((prev) => [...prev, emptyPeriod("amount")])}
            className={BTN_ROW}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            Pevná částka
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-edge pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={LABEL}>Účinnost od</label>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className={`${FIELD} mt-1`}
          />
        </div>
        <div>
          <label className={LABEL}>Fakturace od</label>
          <input
            type="date"
            value={invoicingStartsFrom}
            onChange={(e) => setInvoicingStartsFrom(e.target.value)}
            className={`${FIELD} mt-1`}
          />
          <p className="mt-1 text-[10.5px] text-ink-soft">Prázdné = souběžně s účinností.</p>
        </div>
        {isFranchise ? (
          <div>
            <label className={LABEL}>Konec smlouvy</label>
            <input
              type="date"
              value={termEndsAt}
              onChange={(e) => setTermEndsAt(e.target.value)}
              className={`${FIELD} mt-1`}
            />
            <p className="mt-1 text-[10.5px] text-ink-soft">Od něj se odvíjí i spolupráce/provozování.</p>
          </div>
        ) : (
          <div>
            <label className={LABEL}>Konec smlouvy</label>
            <p className="mt-2 text-[11.5px] text-ink-soft">Dle navázané franšízové smlouvy.</p>
          </div>
        )}
        <div>
          <label className={LABEL}>Měna</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={`${FIELD} mt-1`}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL}>Souhrn (1 věta)</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          placeholder="Stručně kolik a jak se fakturuje."
          className={`${FIELD} mt-1 resize-y`}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
          {saving ? "Ukládám…" : "Uložit poplatky"}
        </button>
        <button type="button" onClick={onClose} disabled={saving} className={BTN_OUTLINE}>
          Zrušit
        </button>
      </div>
    </div>
  );
}
