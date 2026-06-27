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
            className="h-9 shrink-0 rounded-lg border border-edge px-3 text-[12.5px] font-medium text-ink-deep transition-colors hover:bg-edge-warm"
          >
            {filter.vatInclusive ? "s DPH" : "bez DPH"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <Pill key={p} active={filter.preset === p} onClick={() => update({ preset: p })}>
            {DATE_PRESET_LABEL[p]}
          </Pill>
        ))}
        <span className="mx-1.5 hidden h-5 w-px bg-edge sm:block" aria-hidden="true" />
        <Select
          label="Srovnání"
          value={filter.comparison}
          onChange={(v) => update({ comparison: v as PosComparison })}
          options={COMPARISONS.map((c) => ({ value: c, label: COMPARISON_LABEL[c] }))}
        />
      </div>
    </div>
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
      className={`h-8 rounded-lg px-3 text-[12.5px] font-medium transition-colors ${
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
    <div className="inline-flex rounded-lg border border-edge p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`h-8 rounded-md px-2.5 text-[12px] font-semibold tabular-nums transition-colors ${
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
