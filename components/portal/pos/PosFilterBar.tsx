"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  COMPARISON_LABEL,
  DATE_PRESET_LABEL,
  parsePosFilter,
  serializePosFilter,
  type PosComparison,
  type PosDatePreset,
  type PosFilter,
  type PosSelection,
} from "@/lib/portal/pos/filters";
import type { FilterBarData } from "./pos-filter-shared";
import { PosStorePicker } from "./PosStorePicker";
import { PosViewsMenu } from "./PosViewsMenu";

// Sdílený filtr POS. Stav drží URL (searchParams) - persistuje napříč obrazovkami,
// je sdílitelný a server (RSC) čte týž searchParams. Výběr je multi-select
// (koncepty + prodejny), s uložitelnými pohledy.

const PRESETS: PosDatePreset[] = [
  "dnes",
  "vcera",
  "tento-tyden",
  "minuly-tyden",
  "tento-mesic",
  "minuly-mesic",
  "poslednich-30-dni",
  "tento-rok",
];
const COMPARISONS: PosComparison[] = ["predchozi-obdobi", "predchozi-rok", "zadne"];

export function PosFilterBar({ concepts, unpaired, currencies, views, me }: FilterBarData) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filter = parsePosFilter(new URLSearchParams(sp?.toString() ?? ""));

  const update = (patch: Partial<PosFilter>) => {
    const qs = serializePosFilter({ ...filter, ...patch }).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setSelection = (selection: PosSelection) => update({ selection });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of concepts) for (const l of g.locations) m.set(l.id, l.name);
    for (const u of unpaired) m.set(u.id, u.name);
    return m;
  }, [concepts, unpaired]);
  const labelByConcept = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of concepts) m.set(g.concept, g.label);
    return m;
  }, [concepts]);

  const sel = filter.selection;
  const hasSelection = sel.concepts.length > 0 || sel.locations.length > 0;
  const currentFilter = serializePosFilter(filter).toString();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-edge bg-paper p-3 sm:p-4">
      {/* Řádek 1: výběr prodejen + uložené pohledy */}
      <div className="flex flex-wrap items-center gap-2">
        <PosStorePicker
          concepts={concepts}
          unpaired={unpaired}
          selection={sel}
          onChange={setSelection}
        />

        {hasSelection ? (
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {sel.concepts.map((c) => (
              <Chip
                key={`c-${c}`}
                label={labelByConcept.get(c) ?? c}
                accent
                onRemove={() =>
                  update({ selection: { ...sel, concepts: sel.concepts.filter((x) => x !== c) } })
                }
              />
            ))}
            {sel.locations.map((id) => (
              <Chip
                key={`l-${id}`}
                label={nameById.get(id) ?? id}
                onRemove={() =>
                  update({ selection: { ...sel, locations: sel.locations.filter((x) => x !== id) } })
                }
              />
            ))}
            <button
              type="button"
              onClick={() => setSelection({ concepts: [], locations: [] })}
              className="ml-0.5 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base"
            >
              Vyčistit
            </button>
          </div>
        ) : (
          <span className="flex-1 text-[12.5px] text-ink-soft">Celá síť</span>
        )}

        <PosViewsMenu views={views} me={me} currentFilter={currentFilter} />
      </div>

      {/* Řádek 2: období + srovnání + měna + DPH */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <Pill key={p} active={filter.preset === p} onClick={() => update({ preset: p })}>
            {DATE_PRESET_LABEL[p]}
          </Pill>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-edge sm:block" aria-hidden="true" />
        <Select
          label="Srovnání"
          value={filter.comparison}
          onChange={(v) => update({ comparison: v as PosComparison })}
          options={COMPARISONS.map((c) => ({ value: c, label: COMPARISON_LABEL[c] }))}
        />
        <button
          type="button"
          disabled={filter.comparison === "zadne"}
          onClick={() => update({ sameStore: !filter.sameStore })}
          aria-pressed={filter.sameStore}
          title="Jen prodejny s tržbou v obou obdobích (srovnatelná báze)"
          className={`h-8 shrink-0 rounded-full border px-3 text-[12px] font-semibold transition-colors disabled:opacity-40 ${
            filter.sameStore && filter.comparison !== "zadne"
              ? "border-ink-base bg-ink-base text-paper"
              : "border-edge text-ink-deep hover:border-ink-soft"
          }`}
        >
          Stejné prodejny
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Segment
            options={currencies.map((c) => ({ value: c, label: c }))}
            value={filter.currency}
            onChange={(v) => update({ currency: v })}
          />
          <button
            type="button"
            onClick={() => update({ vatInclusive: !filter.vatInclusive })}
            title="Přepnout zobrazení s/bez DPH"
            className="h-8 shrink-0 rounded-full border border-edge px-3 text-[12px] font-semibold text-ink-deep transition-colors hover:border-ink-soft"
          >
            {filter.vatInclusive ? "s DPH" : "bez DPH"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({
  label,
  accent = false,
  onRemove,
}: {
  label: string;
  accent?: boolean;
  onRemove: () => void;
}) {
  return (
    <span
      className={[
        "inline-flex h-7 items-center gap-1 rounded-full border pl-2.5 pr-1 text-[12px] font-medium",
        accent ? "border-ink-base/20 bg-edge-warm text-ink-base" : "border-edge bg-paper text-ink-deep",
      ].join(" ")}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Odebrat ${label}`}
        className="grid h-5 w-5 place-items-center rounded-full text-ink-mid transition-colors hover:bg-ink-base hover:text-paper"
      >
        <X className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
      </button>
    </span>
  );
}

function Pill({
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
      aria-pressed={active}
      className={`h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors ${
        active ? "bg-ink-base text-paper" : "text-ink-deep hover:bg-edge-warm"
      }`}
    >
      {children}
    </button>
  );
}

function Segment({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-edge p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`h-7 rounded-full px-2.5 text-[12px] font-semibold tabular-nums transition-colors ${
            value === o.value ? "bg-ink-base text-paper" : "text-ink-mid hover:text-ink-base"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Select({
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
    <label className="inline-flex items-center gap-2">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-mid">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-[200px] rounded-full border border-edge bg-paper px-3 text-[12.5px] text-ink-base outline-none transition-colors focus:border-ink-base"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
