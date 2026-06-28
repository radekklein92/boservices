"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Pencil,
  Plus,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Coins,
} from "lucide-react";
import { Section } from "@/components/portal/ui/Section";
import { Chip } from "@/components/portal/ui/Chip";
import {
  BTN_PRIMARY,
  BTN_OUTLINE,
  BTN_ROW,
  BTN_ICON,
} from "@/components/portal/ui/buttons";
import {
  CONTRACT_TYPE_META,
  getVariantMeta,
  isApprovalGated,
} from "@/lib/portal/contract-types";
import {
  AMOUNT_PERIOD_LABEL,
  FEE_KIND_LABEL,
  feeTermsForDate,
  formatFeePeriod,
  type AmountPeriod,
  type ContractFeeTerms,
  type FeeKind,
  type FeePeriod,
} from "@/lib/portal/contract-fee-terms";
import { formatDate, formatDateTime } from "./locations-shared";
import type { LocationContractRow } from "./LocationDetail";

const SOURCE_LABEL: Record<ContractFeeTerms["source"], string> = {
  ai: "AI",
  manual: "Ručně",
  "ai-edited": "AI + úpravy",
};

const CONFIDENCE_TONE: Record<ContractFeeTerms["aiConfidence"], string> = {
  high: "border-emerald-300 bg-emerald-50 text-emerald-700",
  medium: "border-sky-300 bg-sky-50 text-sky-700",
  low: "border-amber-300 bg-amber-50 text-amber-700",
  none: "border-edge bg-edge-warm text-ink-mid",
};

const CONFIDENCE_LABEL: Record<ContractFeeTerms["aiConfidence"], string> = {
  high: "Vysoká jistota",
  medium: "Střední jistota",
  low: "Nízká jistota",
  none: "Bez údaje",
};

const CURRENCIES = ["CZK", "EUR", "PLN"] as const;
const KINDS: FeeKind[] = ["franchise", "marketing", "operation", "cooperation", "other"];

const FIELD =
  "w-full rounded-lg border border-edge bg-paper px-3 py-2 text-[13px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base";
const LABEL = "block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft";

// Sekce „Poplatky a fakturace" na detailu lokality. Karta na každou podepsanou
// approval-gated smlouvu (franšíza/spolupráce/provozování) navázanou na lokalitu.
export function LocationFeeTermsSection({
  contracts,
}: {
  contracts: LocationContractRow[];
}) {
  const eligible = contracts.filter(
    (c) =>
      !c.cancelled &&
      isApprovalGated(c.type) &&
      (c.feeTerms || c.clientSignedAt || c.feeTermsError),
  );
  if (eligible.length === 0) return null;

  return (
    <Section
      title="Poplatky a fakturace"
      hint="Vytaženo ze smlouvy AI při podpisu, ručně upravitelné. Podklad pro budoucí fakturaci klientovi."
    >
      <div className="flex flex-col gap-3">
        {eligible.map((c) => (
          <FeeCard key={c.id} contract={c} />
        ))}
      </div>
    </Section>
  );
}

function FeeCard({ contract }: { contract: LocationContractRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = CONTRACT_TYPE_META[contract.type];
  const variantMeta = contract.variant
    ? getVariantMeta(contract.type, contract.variant)
    : null;
  const terms = contract.feeTerms;

  async function runExtract(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/contracts/${contract.id}/fee-terms${force ? "?force=1" : ""}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (res.status === 409 && data.locked) {
        if (
          window.confirm(
            "Poplatky byly ručně upraveny. Opravdu je přepsat tím, co načte AI ze smlouvy?",
          )
        ) {
          setBusy(false);
          return runExtract(true);
        }
        setBusy(false);
        return;
      }
      if (!data.ok) throw new Error(data.error || "Načtení z AI selhalo.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Načtení z AI selhalo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-edge bg-paper px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[14px] font-bold tracking-[-0.01em] text-ink-base">
            <Coins className="h-4 w-4 shrink-0 text-ink-mid" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">{meta.shortName}</span>
            {variantMeta && (
              <span className="text-[11.5px] font-medium text-ink-soft">
                {variantMeta.label}
              </span>
            )}
          </div>
          <Link
            href={`/portal/contracts/${contract.id}`}
            className="mt-0.5 inline-block text-[11.5px] text-ink-soft underline-offset-2 hover:underline"
          >
            {contract.number ? `Smlouva ${contract.number}` : "Otevřít smlouvu"}
          </Link>
        </div>
        {terms && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone="border-edge bg-edge-warm text-ink-mid">{SOURCE_LABEL[terms.source]}</Chip>
            {terms.source !== "manual" && (
              <Chip tone={CONFIDENCE_TONE[terms.aiConfidence]}>
                {CONFIDENCE_LABEL[terms.aiConfidence]}
              </Chip>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          {error}
        </div>
      )}

      {editing ? (
        <FeeEditor
          contractId={contract.id}
          initial={terms}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : (
        <div className="mt-3">
          {terms ? (
            <FeeReadView terms={terms} />
          ) : contract.feeTermsError ? (
            <p className="text-[13px] text-amber-700">{contract.feeTermsError}</p>
          ) : (
            <p className="text-[13px] text-ink-mid">
              Poplatky zatím nebyly vytaženy. Spusťte načtení z AI nebo doplňte ručně.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={BTN_ROW}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              {terms ? "Upravit" : "Doplnit ručně"}
            </button>
            <button
              type="button"
              onClick={() => runExtract(false)}
              disabled={busy}
              className={BTN_ROW}
            >
              {terms ? (
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              )}
              {busy ? "Načítám…" : terms ? "Obnovit z AI" : "Načíst z AI"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FeeReadView({ terms }: { terms: ContractFeeTerms }) {
  const today = feeTermsForDate(terms, new Date().toISOString());
  return (
    <div className="flex flex-col gap-3">
      {terms.summary && (
        <p className="text-[13.5px] leading-relaxed text-ink-deep">{terms.summary}</p>
      )}

      {terms.periods.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {terms.periods.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-edge/60 pb-1.5 last:border-0"
            >
              <span className="text-[13px] font-medium text-ink-base">
                {p.label || FEE_KIND_LABEL[p.kind]}
              </span>
              <span className="text-[13px] text-ink-deep">
                {formatFeePeriod(p, terms.currency)}
                <span className="ml-2 text-[11.5px] text-ink-soft">{periodRange(p)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-mid">Žádné poplatkové položky.</p>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
        <FactRow label="Účinnost od" value={terms.effectiveFrom ? formatDate(terms.effectiveFrom) : "dnem podpisu"} />
        <FactRow
          label="Fakturace od"
          value={terms.invoicingStartsFrom ? formatDate(terms.invoicingStartsFrom) : "souběžně s účinností"}
        />
        <FactRow label="Měna" value={terms.currency} />
        <FactRow
          label="Aktuálně fakturovat"
          value={today.billable ? today.label : today.effectiveYet ? "ještě nefakturovat" : "smlouva ještě neúčinná"}
        />
      </dl>

      {terms.aiNotes && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Pozn. AI: {terms.aiNotes}
        </p>
      )}
      {terms.updatedAt && (
        <p className="text-[11px] text-ink-soft">
          Naposledy {formatDateTime(terms.updatedAt)}
          {terms.updatedBy ? ` · ${terms.updatedBy}` : ""}
        </p>
      )}
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-soft">{label}</dt>
      <dd className="text-right font-medium text-ink-deep">{value}</dd>
    </div>
  );
}

function periodRange(p: FeePeriod): string {
  const from = p.from ? formatDate(p.from) : "od účinnosti";
  const to = p.to ? formatDate(p.to) : "trvale";
  return `${from} - ${to}`;
}

// ── Editor ────────────────────────────────────────────────────────────────────

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

function FeeEditor({
  contractId,
  initial,
  onClose,
  onSaved,
}: {
  contractId: string;
  initial: ContractFeeTerms | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? "");
  const [invoicingStartsFrom, setInvoicingStartsFrom] = useState(
    initial?.invoicingStartsFrom ?? "",
  );
  const [currency, setCurrency] = useState(initial?.currency || "CZK");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [periods, setPeriods] = useState<DraftPeriod[]>(
    initial?.periods.map(toDraftPeriod) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          percentBase: isPercent ? p.percentBase : "",
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
    <div className="mt-3 flex flex-col gap-4">
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
                <>
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
                  <div className="sm:col-span-2">
                    <label className={LABEL}>Z čeho (základ)</label>
                    <input
                      value={p.percentBase}
                      onChange={(e) => patchPeriod(i, { percentBase: e.target.value })}
                      placeholder="měsíční obrat bez DPH"
                      className={`${FIELD} mt-1`}
                    />
                  </div>
                </>
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

              <div className="sm:col-span-2">
                <label className={LABEL}>Poznámka</label>
                <input
                  value={p.note}
                  onChange={(e) => patchPeriod(i, { note: e.target.value })}
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
            Procentuální poplatek
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

      <div className="grid grid-cols-1 gap-3 border-t border-edge pt-4 sm:grid-cols-3">
        <div>
          <label className={LABEL}>Účinnost smlouvy od</label>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className={`${FIELD} mt-1`}
          />
          <p className="mt-1 text-[10.5px] text-ink-soft">Prázdné = dnem podpisu.</p>
        </div>
        <div>
          <label className={LABEL}>Fakturace od (odklad)</label>
          <input
            type="date"
            value={invoicingStartsFrom}
            onChange={(e) => setInvoicingStartsFrom(e.target.value)}
            className={`${FIELD} mt-1`}
          />
          <p className="mt-1 text-[10.5px] text-ink-soft">Prázdné = souběžně s účinností.</p>
        </div>
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
          placeholder="Stručně kolik a jak se fakturuje (1 věta)."
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
