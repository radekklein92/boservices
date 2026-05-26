"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  CLAIM_ORIGIN_OPTIONS,
  claimOriginLabel,
  computeClaimsTotal,
  formatCzk,
  newClaimItem,
  parseClaimAmount,
  type ClaimItem,
  type ClaimOrigin,
} from "@/lib/portal/claims";

type Props = {
  claims: ClaimItem[];
  onChange: (next: ClaimItem[]) => void;
};

// Editor seznamu pohledávek pro Přílohu č. 1. Z jednotlivých pohledávek se při
// generování PDF poskládá tabulka a sečte celková výše (vč. DPH).
export function ClaimsBuilder({ claims, onChange }: Props) {
  function update(id: string, patch: Partial<ClaimItem>) {
    onChange(claims.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function add() {
    onChange([...claims, newClaimItem()]);
  }
  function remove(id: string) {
    onChange(claims.filter((c) => c.id !== id));
  }

  const total = computeClaimsTotal(claims);
  const filled = claims.filter((c) => parseClaimAmount(c.amount) > 0);

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-edge bg-paper p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-base">
            Příloha č. 1 — Pohledávky
          </h2>
          <span className="text-[11.5px] text-ink-mid">
            · Jednotlivé pohledávky. Z nich se vygeneruje tabulka a sečte
            celková výše (vč. DPH).
          </span>
        </div>
      </div>

      {claims.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge bg-paper-warm px-4 py-8 text-center">
          <p className="text-[13px] text-ink-mid">
            Zatím žádná pohledávka. Přidejte první položku seznamu.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {claims.map((claim, idx) => (
            <ClaimCard
              key={claim.id}
              index={idx}
              claim={claim}
              onPatch={(patch) => update(claim.id, patch)}
              onRemove={() => remove(claim.id)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={add}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-edge bg-paper px-4 text-[13px] font-semibold text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Přidat pohledávku
        </button>
        <div className="flex items-baseline gap-2 rounded-full bg-ink-base px-4 py-2 text-paper">
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-paper/70">
            Celkem vč. DPH
          </span>
          <span className="font-mono text-[14px] font-bold tracking-[-0.01em]">
            {formatCzk(total)}
          </span>
        </div>
      </div>

      {/* Živý náhled tabulky, jak se objeví v Příloze č. 1 */}
      {filled.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
            Náhled tabulky v příloze
          </div>
          <div className="overflow-x-auto rounded-xl border border-edge">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-paper-warm text-ink-mid">
                  <Th>Vznikla ze smlouvy</Th>
                  <Th>Číslo faktury</Th>
                  <Th align="right">Výše (vč. DPH)</Th>
                  <Th>Splatnost</Th>
                  <Th>Poznámka</Th>
                </tr>
              </thead>
              <tbody>
                {filled.map((c) => (
                  <tr key={c.id} className="border-t border-edge">
                    <Td>{claimOriginLabel(c)}</Td>
                    <Td muted={!c.invoiceNumber?.trim()}>
                      {c.invoiceNumber?.trim() || "—"}
                    </Td>
                    <Td align="right" nowrap>
                      {formatCzk(parseClaimAmount(c.amount))}
                    </Td>
                    <Td muted={!c.dueDate?.trim()}>{c.dueDate?.trim() || "—"}</Td>
                    <Td muted={!c.note?.trim()}>{c.note?.trim() || "—"}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-base bg-paper-warm">
                  <Td bold>Celkem</Td>
                  <Td />
                  <Td align="right" nowrap bold>
                    {formatCzk(total)}
                  </Td>
                  <Td />
                  <Td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function ClaimCard({
  index,
  claim,
  onPatch,
  onRemove,
}: {
  index: number;
  claim: ClaimItem;
  onPatch: (patch: Partial<ClaimItem>) => void;
  onRemove: () => void;
}) {
  const parsed = parseClaimAmount(claim.amount);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-edge bg-paper-warm p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] text-ink-soft">
          Pohledávka {String(index + 1).padStart(2, "0")}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Odebrat pohledávku"
          className="grid h-8 w-8 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-base hover:bg-ink-base hover:text-paper"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SelectField
          label="Vznikla ze smlouvy"
          value={claim.origin}
          onChange={(v) => onPatch({ origin: v as ClaimOrigin })}
          options={CLAIM_ORIGIN_OPTIONS}
        />
        <TextField
          label="Datum uzavření smlouvy"
          hint="ze které pohledávka vznikla"
          value={claim.originDate ?? ""}
          placeholder="např. 12. 3. 2026"
          onChange={(v) => onPatch({ originDate: v })}
        />
      </div>

      {claim.origin === "jina" && (
        <TextField
          label="Upřesnění — jaká smlouva"
          value={claim.originOther ?? ""}
          placeholder="např. Smlouva o zápůjčce"
          onChange={(v) => onPatch({ originOther: v })}
        />
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField
          label="Výše pohledávky (vč. DPH)"
          hint={parsed > 0 ? formatCzk(parsed) : "v Kč"}
          value={claim.amount}
          placeholder="150 000"
          onChange={(v) => onPatch({ amount: v })}
        />
        <TextField
          label="Splatnost"
          hint="dobrovolné — neuvádí se u neoznámených"
          value={claim.dueDate ?? ""}
          placeholder="např. 31. 12. 2026"
          onChange={(v) => onPatch({ dueDate: v })}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField
          label="Číslo faktury"
          hint="dobrovolné"
          value={claim.invoiceNumber ?? ""}
          placeholder="např. FV 2026/014"
          onChange={(v) => onPatch({ invoiceNumber: v })}
        />
      </div>

      <TextAreaField
        label="Poznámka"
        hint="dobrovolné"
        value={claim.note ?? ""}
        placeholder="vlastní poznámka k pohledávce"
        onChange={(v) => onPatch({ note: v })}
      />
    </div>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="flex items-baseline gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
      <span>{label}</span>
      {hint && (
        <span className="normal-case tracking-normal text-[10px] text-ink-soft">
          · {hint}
        </span>
      )}
    </span>
  );
}

function TextField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel label={label} hint={hint} />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-edge bg-paper px-3 text-[13.5px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
      />
    </label>
  );
}

function TextAreaField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel label={label} hint={hint} />
      <textarea
        value={value}
        placeholder={placeholder}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-lg border border-edge bg-paper px-3 py-2 text-[13.5px] leading-relaxed text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel label={label} />
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full appearance-none rounded-lg border border-edge bg-paper pl-3 pr-9 text-[13.5px] text-ink-base outline-none transition-colors focus:border-ink-base"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mid"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
    </label>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  nowrap = false,
  bold = false,
  muted = false,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  nowrap?: boolean;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={[
        "px-3 py-2 align-top",
        align === "right" ? "text-right" : "text-left",
        nowrap ? "whitespace-nowrap" : "",
        bold ? "font-bold text-ink-base" : "",
        muted ? "text-ink-soft" : "text-ink-deep",
      ].join(" ")}
    >
      {children}
    </td>
  );
}
