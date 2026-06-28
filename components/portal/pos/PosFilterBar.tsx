"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  COMPARISON_LABEL,
  DATE_PRESET_LABEL,
  parsePosFilter,
  serializePosFilter,
  type PosComparison,
  type PosDatePreset,
  type PosFilter,
} from "@/lib/portal/pos/filters";
import { FilterChip } from "@/components/portal/ui/FilterChip";

// Sdílený filtr POS dashboardu. Stav drží URL (searchParams) - persistuje napříč
// obrazovkami a je sdílitelný/bookmarkovatelný. Server (RSC) čte týž searchParams.
// Rozsah zatím Vše / Značka; město a pobočka přibudou s párováním.

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

export function PosFilterBar({
  brands,
  shops,
  currencies,
}: {
  brands: { id: string; name: string }[];
  shops: { id: string; name: string; brandId: string }[];
  currencies: string[];
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filter = parsePosFilter(new URLSearchParams(sp?.toString() ?? ""));

  const update = (patch: Partial<PosFilter>) => {
    const qs = serializePosFilter({ ...filter, ...patch }).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const scope = filter.scope;
  let brandValue = "";
  let shopValue = "";
  if (scope.kind === "brand") {
    brandValue = scope.brandId;
  } else if (scope.kind === "shop") {
    shopValue = scope.shopId;
    const sid = scope.shopId;
    brandValue = shops.find((s) => s.id === sid)?.brandId ?? "";
  }
  const shopOptions = brandValue ? shops.filter((s) => s.brandId === brandValue) : shops;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-edge bg-paper p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Select
          label="Značka"
          value={brandValue}
          onChange={(v) => update({ scope: v ? { kind: "brand", brandId: v } : { kind: "all" } })}
          options={[{ value: "", label: "Všechny značky" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
        />
        <Select
          label="Pobočka"
          value={shopValue}
          onChange={(v) =>
            update({
              scope: v
                ? { kind: "shop", shopId: v }
                : brandValue
                  ? { kind: "brand", brandId: brandValue }
                  : { kind: "all" },
            })
          }
          options={[
            { value: "", label: "Všechny pobočky" },
            ...shopOptions.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {currencies.map((c) => (
            <FilterChip
              key={c}
              active={filter.currency === c}
              onClick={() => update({ currency: c })}
              label={c}
            />
          ))}
          <button
            type="button"
            onClick={() => update({ vatInclusive: !filter.vatInclusive })}
            title="Přepnout zobrazení s/bez DPH"
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-edge bg-paper px-3.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft"
          >
            {filter.vatInclusive ? "s DPH" : "bez DPH"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <FilterChip
            key={p}
            active={filter.preset === p}
            onClick={() => update({ preset: p })}
            label={DATE_PRESET_LABEL[p]}
          />
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
          className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[12.5px] font-medium transition-colors disabled:opacity-40 ${
            filter.sameStore && filter.comparison !== "zadne"
              ? "border-ink-base bg-ink-base text-paper"
              : "border-edge bg-paper text-ink-deep hover:border-ink-soft"
          }`}
        >
          Stejné prodejny
        </button>
      </div>
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
      <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-mid">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 max-w-[220px] rounded-lg border border-edge bg-paper px-2.5 text-[13px] text-ink-base outline-none transition-colors focus:border-ink-base"
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
