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
import { FilterChip } from "@/components/portal/ui/FilterChip";
import type { FilterBarData } from "./pos-filter-shared";
import { PosStorePicker } from "./PosStorePicker";
import { PosViewsMenu } from "./PosViewsMenu";

// Sdílený filtr POS. Stav drží URL (searchParams) - persistuje napříč obrazovkami,
// je sdílitelný a server (RSC) čte týž searchParams. Výběr je multi-select
// (koncepty + prodejny), s uložitelnými pohledy. Datové presety + měna jedou přes
// sdílenou FilterChip (konzistence s portálem + a11y focus-visible).

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

// Výchozí rozsah pro „Vlastní" období (posledních 30 dní), YYYY-MM-DD.
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Pilulkové tlačítko sladěné s FilterChip (h-9, rounded-full, a11y ring).
const TOGGLE_BASE =
  "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50";

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
        <PosStorePicker concepts={concepts} selection={sel} onChange={setSelection} />

        {hasSelection ? (
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {sel.concepts.map((c) => (
              <Chip
                key={`c-${c}`}
                label={labelByConcept.get(c) ?? c}
                accent
                onRemove={() => update({ selection: { ...sel, concepts: sel.concepts.filter((x) => x !== c) } })}
              />
            ))}
            {sel.locations.map((id) => (
              <Chip
                key={`l-${id}`}
                label={nameById.get(id) ?? id}
                onRemove={() => update({ selection: { ...sel, locations: sel.locations.filter((x) => x !== id) } })}
              />
            ))}
            <button
              type="button"
              onClick={() => setSelection({ concepts: [], locations: [] })}
              className="ml-0.5 rounded-full px-1.5 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
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
          <FilterChip
            key={p}
            active={filter.preset === p}
            onClick={() => update({ preset: p })}
            label={DATE_PRESET_LABEL[p]}
          />
        ))}
        <FilterChip
          active={filter.preset === "vlastni"}
          onClick={() => update({ preset: "vlastni", from: filter.from ?? isoDaysAgo(29), to: filter.to ?? isoToday() })}
          label="Vlastní"
        />
        {filter.preset === "vlastni" && (
          <span className="inline-flex items-center gap-1.5">
            <input
              type="date"
              value={filter.from ?? ""}
              max={filter.to}
              onChange={(e) => update({ from: e.target.value })}
              className="h-9 rounded-full border border-edge bg-paper px-3 text-[12.5px] tabular-nums text-ink-base outline-none transition-colors focus-visible:border-ink-base focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            />
            <span className="text-ink-soft" aria-hidden="true">-</span>
            <input
              type="date"
              value={filter.to ?? ""}
              min={filter.from}
              onChange={(e) => update({ to: e.target.value })}
              className="h-9 rounded-full border border-edge bg-paper px-3 text-[12.5px] tabular-nums text-ink-base outline-none transition-colors focus-visible:border-ink-base focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            />
          </span>
        )}
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
          className={`${TOGGLE_BASE} ${
            filter.sameStore && filter.comparison !== "zadne"
              ? "border-ink-base bg-ink-base text-paper"
              : "border-edge bg-paper text-ink-deep hover:border-ink-soft"
          }`}
        >
          Stejné prodejny
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {currencies.map((c) => (
            <FilterChip key={c} active={filter.currency === c} onClick={() => update({ currency: c })} label={c} />
          ))}
          <span className="mx-1 hidden h-5 w-px bg-edge sm:block" aria-hidden="true" />
          <button
            type="button"
            onClick={() => update({ vatInclusive: !filter.vatInclusive })}
            aria-pressed={filter.vatInclusive}
            title="Přepnout zobrazení s/bez DPH"
            className={`${TOGGLE_BASE} border-edge bg-paper text-ink-deep hover:border-ink-soft`}
          >
            {filter.vatInclusive ? "s DPH" : "bez DPH"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, accent = false, onRemove }: { label: string; accent?: boolean; onRemove: () => void }) {
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
        className="grid h-5 w-5 place-items-center rounded-full text-ink-mid transition-colors hover:bg-ink-base hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base"
      >
        <X className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
      </button>
    </span>
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
        className="h-9 max-w-[200px] rounded-full border border-edge bg-paper px-3 text-[12.5px] text-ink-base outline-none transition-colors focus-visible:border-ink-base focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
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
