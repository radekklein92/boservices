"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Store, X } from "lucide-react";
import {
  comparisonLabel,
  DATE_PRESET_LABEL,
  parsePosFilter,
  serializePosFilter,
  type PosDatePreset,
  type PosFilter,
  type PosSelection,
} from "@/lib/portal/pos/filters";
import { FilterChip } from "@/components/portal/ui/FilterChip";
import { Toggle } from "@/components/portal/ui/Toggle";
import type { FilterBarData } from "./pos-filter-shared";
import { PosStorePicker } from "./PosStorePicker";
import { PosViewsMenu } from "./PosViewsMenu";
import { PosMobileLinkButton } from "./PosMobileLinkButton";

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

// hidePeriod: skryje blok období (presety/Vlastní), srovnávací popisek i "Stejné
// prodejny" - pro stránku Živě, kde je období vždy "dnes" (filtr by jen mátl).
export function PosFilterBar({
  concepts,
  unpaired,
  currencies,
  views,
  me,
  hidePeriod = false,
}: FilterBarData & { hidePeriod?: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filter = parsePosFilter(new URLSearchParams(sp?.toString() ?? ""));

  const update = (patch: Partial<PosFilter>) => {
    const qs = serializePosFilter({ ...filter, ...patch }).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setSelection = (selection: PosSelection) => update({ selection });

  // Vlastní období: lokální draft + debounce, ať se nefiltruje při každém úhozu.
  const [draftFrom, setDraftFrom] = useState(filter.from ?? "");
  const [draftTo, setDraftTo] = useState(filter.to ?? "");
  useEffect(() => {
    setDraftFrom(filter.from ?? "");
    setDraftTo(filter.to ?? "");
  }, [filter.from, filter.to]);
  const dateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitDates = (from: string, to: string) => {
    if (dateTimer.current) clearTimeout(dateTimer.current);
    dateTimer.current = setTimeout(() => {
      if (from && to) update({ preset: "vlastni", from, to });
    }, 600);
  };

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of concepts) for (const l of g.locations) m.set(l.id, l.name);
    for (const u of unpaired) m.set(u.id, u.name);
    return m;
  }, [concepts, unpaired]);
  const locLabel = (id: string) => (id.startsWith("city:") ? id.slice(5) : nameById.get(id) ?? id);
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
      {/* Řádek 1: výběr prodejen + "Stejné prodejny" + měna + DPH + uložené pohledy */}
      <div className="flex flex-wrap items-center gap-2">
        <PosStorePicker concepts={concepts} selection={sel} onChange={setSelection} />

        {/* Okruh prodejen: BOS prodejny (default) vs celá síť - segmentovaný control
            jako měna. Omezuje obsah pickeru i agregaci (queries protnou s BOS). */}
        <ScopeToggle scope={filter.scope} onChange={(scope) => update({ scope })} />

        {hasSelection ? (
          <div className="flex flex-1 items-center">
            <SelectionSummary
              concepts={sel.concepts.map((c) => ({ id: c, label: labelByConcept.get(c) ?? c, accent: true }))}
              locations={sel.locations.map((id) => ({ id, label: locLabel(id) }))}
              onRemoveConcept={(c) => update({ selection: { ...sel, concepts: sel.concepts.filter((x) => x !== c) } })}
              onRemoveLocation={(id) => update({ selection: { ...sel, locations: sel.locations.filter((x) => x !== id) } })}
              onClear={() => setSelection({ concepts: [], locations: [] })}
            />
          </div>
        ) : (
          <div className="flex-1" aria-hidden="true" />
        )}

        {/* Filtr ŽEBŘÍČKU "Stejné prodejny" (like-for-like): skryje prodejny bez
            srovnatelného základu. Na deltu KPI nemá vliv - ta je vždy like-for-like. */}
        {!hidePeriod && (
          <button
            type="button"
            onClick={() => update({ sameStore: !filter.sameStore })}
            aria-pressed={filter.sameStore}
            title="Skrýt v žebříčku prodejny bez tržby v obou obdobích (srovnatelná báze). Na deltu KPI nemá vliv."
            className={`${TOGGLE_BASE} ${
              filter.sameStore
                ? "border-ink-base bg-ink-base text-paper"
                : "border-edge bg-paper text-ink-deep hover:border-ink-soft"
            }`}
          >
            Stejné prodejny
          </button>
        )}
        {/* Zobrazovací měna + Ceny s DPH na řádku 1 (na řádek presetů se vedle nich nevejdou;
            zobrazují se vždy, i na Živě). Měna: vše se přepočítá přes FX (ČNB kurz). */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="radiogroup"
            aria-label="Zobrazovací měna"
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-edge bg-paper p-0.5"
          >
            {currencies.map((c) => {
              const active = filter.currency === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => update({ currency: c })}
                  className={`inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-1 focus-visible:ring-offset-paper ${
                    active ? "bg-ink-base text-paper" : "text-ink-mid hover:text-ink-base"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <span className="mx-1 hidden h-5 w-px bg-edge sm:block" aria-hidden="true" />
          <Toggle
            checked={filter.vatInclusive}
            onChange={(next) => update({ vatInclusive: next })}
            label="Ceny s DPH"
            title="Přepnout zobrazení s DPH / bez DPH"
          />
        </div>
      </div>

      {/* Řádek 2: období (datumové presety) + srovnání (label "vs ...") vlevo, ikonová
          tlačítka (Pohledy, Na mobil) zarovnaná doprava. Řádek se vykresluje vždy - i na
          Živě (hidePeriod), kde presety odpadnou, ať ikony nezůstanou viset v řádku 1. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {!hidePeriod && (
          <>
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
                  value={draftFrom}
                  max={draftTo || undefined}
                  onChange={(e) => {
                    setDraftFrom(e.target.value);
                    commitDates(e.target.value, draftTo);
                  }}
                  className="h-9 rounded-full border border-edge bg-paper px-3 text-[12.5px] tabular-nums text-ink-base outline-none transition-colors focus-visible:border-ink-base focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                />
                <span className="text-ink-soft" aria-hidden="true">-</span>
                <input
                  type="date"
                  value={draftTo}
                  min={draftFrom || undefined}
                  onChange={(e) => {
                    setDraftTo(e.target.value);
                    commitDates(draftFrom, e.target.value);
                  }}
                  className="h-9 rounded-full border border-edge bg-paper px-3 text-[12.5px] tabular-nums text-ink-base outline-none transition-colors focus-visible:border-ink-base focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                />
              </span>
            )}
            <span className="mx-1 hidden h-5 w-px bg-edge sm:block" aria-hidden="true" />
            {/* Srovnání s předchozím obdobím je vždy zapnuté - jen ukážeme baseline. */}
            <span className="hidden text-[11px] text-ink-soft sm:inline">
              vs {comparisonLabel(filter).toLowerCase()}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <PosViewsMenu views={views} me={me} currentFilter={currentFilter} />
          <PosMobileLinkButton
            concepts={concepts}
            currencies={currencies}
            initialSelection={sel}
            initialScope={filter.scope}
            initialCurrency={filter.currency}
            initialVatInclusive={filter.vatInclusive}
          />
        </div>
      </div>
    </div>
  );
}

// Souhrn výběru prodejen: místo dlouhého výpisu chipů (rozpadal řádek u dlouhých
// názvů / mnoha položek) jen ikona prodejny s počtem v rohu. Seznam s možností
// odebrat jednotlivé položky se objeví v bublině po najetí myší / fokusu.
function SelectionSummary({
  concepts,
  locations,
  onRemoveConcept,
  onRemoveLocation,
  onClear,
}: {
  concepts: { id: string; label: string; accent?: boolean }[];
  locations: { id: string; label: string }[];
  onRemoveConcept: (id: string) => void;
  onRemoveLocation: (id: string) => void;
  onClear: () => void;
}) {
  const count = concepts.length + locations.length;
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="group relative inline-flex">
        <span
          tabIndex={0}
          role="button"
          aria-label={`Vybráno prodejen/konceptů: ${count}. Zobrazit seznam.`}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-edge bg-paper text-ink-deep transition-colors hover:border-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          <Store className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-base px-1 text-[10px] font-semibold leading-none text-paper">
            {count}
          </span>
        </span>
        {/* Bublina se seznamem: top-full bez mezery, ať myš přejde z ikony do bubliny
            bez "díry", která by ji zavřela. Otevírá se na hover i focus-within. */}
        <div className="invisible absolute left-0 top-full z-20 pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
          <div className="flex max-w-[320px] flex-wrap items-center gap-1.5 rounded-xl border border-edge bg-paper p-2.5 shadow-lg">
            {concepts.map((c) => (
              <Chip key={`c-${c.id}`} label={c.label} accent={c.accent} onRemove={() => onRemoveConcept(c.id)} />
            ))}
            {locations.map((l) => (
              <Chip key={`l-${l.id}`} label={l.label} onRemove={() => onRemoveLocation(l.id)} />
            ))}
          </div>
        </div>
      </div>
      {/* Vyčistit ven z bubliny - zrušení celého výběru jedním klikem. */}
      <button
        type="button"
        onClick={onClear}
        className="rounded-full px-1.5 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        Vyčistit
      </button>
    </div>
  );
}

function Chip({ label, accent = false, onRemove }: { label: string; accent?: boolean; onRemove: () => void }) {
  return (
    <span
      className={[
        "inline-flex h-7 max-w-full items-center gap-1 rounded-full border pl-2.5 pr-1 text-[12px] font-medium",
        accent ? "border-ink-base/20 bg-edge-warm text-ink-base" : "border-edge bg-paper text-ink-deep",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Odebrat ${label}`}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-ink-base hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base"
      >
        <X className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
      </button>
    </span>
  );
}

// Okruh prodejen (BOS prodejny / celá síť): segmentovaný control sladěný s přepínačem
// měny (h-9 pilulka, role=radiogroup). Default je BOS - dashboard ukazuje jen BOS síť.
function ScopeToggle({
  scope,
  onChange,
}: {
  scope: PosFilter["scope"];
  onChange: (scope: PosFilter["scope"]) => void;
}) {
  const OPTIONS: { value: PosFilter["scope"]; label: string }[] = [
    { value: "bos", label: "BOS prodejny" },
    { value: "all", label: "Celá síť" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Okruh prodejen"
      className="inline-flex h-9 shrink-0 items-center rounded-full border border-edge bg-paper p-0.5"
    >
      {OPTIONS.map((o) => {
        const active = scope === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-1 focus-visible:ring-offset-paper ${
              active ? "bg-ink-base text-paper" : "text-ink-mid hover:text-ink-base"
            }`}
          >
            {o.label}
          </button>
        );
      })}
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
