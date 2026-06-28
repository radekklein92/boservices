"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, MapPin, Search } from "lucide-react";
import type { PosSelection } from "@/lib/portal/pos/filters";
import type { CityGroup, ConceptGroup } from "./pos-filter-shared";

// Výběr prodejen jako COMBOBOX: vždy viditelné vyhledávací pole (zároveň spouštěč),
// klik na pole i šipku otevře. Třístupňový strom Koncept -> Město -> Prodejna:
// rozbalím koncept, rozbalím město a tam vybírám jednotlivé prodejny. Checkbox
// konceptu vybere celý koncept (token konceptu), checkbox města vybere všechny
// jeho prodejny v daném konceptu (locationId tokeny), prodejna má vlastní checkbox.
// Nenapárované pokladny se zde NEzobrazují.

function Box({ checked, muted = false }: { checked: boolean; muted?: boolean }) {
  return (
    <span
      className={[
        "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-colors",
        checked
          ? muted
            ? "border-ink-soft bg-ink-soft text-paper"
            : "border-ink-base bg-ink-base text-paper"
          : "border-edge bg-paper",
      ].join(" ")}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
    </span>
  );
}

export function PosStorePicker({
  concepts,
  selection,
  onChange,
}: {
  concepts: ConceptGroup[];
  selection: PosSelection;
  onChange: (next: PosSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const conceptSet = useMemo(() => new Set(selection.concepts), [selection.concepts]);
  const locSet = useMemo(() => new Set(selection.locations), [selection.locations]);

  const toggleConcept = (c: ConceptGroup["concept"]) => {
    const next = new Set(conceptSet);
    next.has(c) ? next.delete(c) : next.add(c);
    onChange({ ...selection, concepts: [...next] });
  };
  const toggleLocation = (id: string) => {
    const next = new Set(locSet);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange({ ...selection, locations: [...next] });
  };
  // Celé město v rámci konceptu = množina jeho locationId tokenů (scoped na koncept).
  const toggleCity = (cg: CityGroup, allOn: boolean) => {
    const next = new Set(locSet);
    for (const l of cg.locations) (allOn ? next.delete(l.id) : next.add(l.id));
    onChange({ ...selection, locations: [...next] });
  };
  const clearAll = () => onChange({ concepts: [], locations: [] });

  const ql = q.trim().toLowerCase();
  const match = (s: string) => s.toLowerCase().includes(ql);
  // Filtrace při hledání: koncept podle názvu (-> celý), jinak města podle názvu
  // (-> všechny jeho prodejny) nebo prodejny podle názvu.
  const groups: ConceptGroup[] = !ql
    ? concepts
    : (concepts
        .map((g) => {
          if (match(g.label)) return g;
          const cities = g.cities
            .map((cg) => {
              if (match(cg.city)) return cg;
              const locations = cg.locations.filter((l) => match(l.name));
              return locations.length ? { ...cg, locations } : null;
            })
            .filter(Boolean) as CityGroup[];
          if (cities.length === 0) return null;
          return { ...g, cities, locations: cities.flatMap((c) => c.locations) };
        })
        .filter(Boolean) as ConceptGroup[]);

  const isExpanded = (key: string) => expanded.has(key) || ql.length > 0;
  const toggleExpand = (key: string) => {
    const next = new Set(expanded);
    next.has(key) ? next.delete(key) : next.add(key);
    setExpanded(next);
  };

  const empty = selection.concepts.length === 0 && selection.locations.length === 0;

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
        className={`flex h-9 w-[340px] max-w-full cursor-text items-center gap-2 rounded-full border bg-paper px-3.5 transition-colors ${
          open ? "border-ink-base" : "border-edge hover:border-ink-soft"
        }`}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-ink-mid" strokeWidth={1.75} aria-hidden="true" />
        <input
          ref={inputRef}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder="Hledat prodejnu, koncept nebo město"
          className="h-full w-full bg-transparent text-[12.5px] text-ink-base outline-none placeholder:text-ink-mid"
        />
        <button
          type="button"
          aria-label={open ? "Zavřít" : "Otevřít"}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="grid h-5 w-5 shrink-0 place-items-center text-ink-mid"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[340px] max-w-[88vw] overflow-hidden rounded-2xl border border-edge bg-paper shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]">
          <div className="max-h-[min(60vh,440px)] overflow-y-auto p-1.5">
            {groups.length === 0 && (
              <p className="px-3 py-6 text-center text-[12.5px] text-ink-mid">Nic nenalezeno.</p>
            )}

            {groups.length > 0 && (
              <div className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                Koncepty
              </div>
            )}
            {groups.map((g) => {
              const conceptOn = conceptSet.has(g.concept);
              const conceptExpanded = isExpanded(g.concept);
              return (
                <div key={g.concept} className="mb-0.5">
                  <div className="flex items-center gap-1 rounded-lg pr-1 hover:bg-edge-warm">
                    <button
                      type="button"
                      onClick={() => toggleConcept(g.concept)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left"
                    >
                      <Box checked={conceptOn} />
                      <span className="truncate text-[13px] font-semibold text-ink-base">{g.label}</span>
                      <span className="font-mono text-[10.5px] text-ink-soft">{g.locations.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExpand(g.concept)}
                      aria-label={conceptExpanded ? "Sbalit" : "Rozbalit"}
                      className="grid h-7 w-7 place-items-center rounded-md text-ink-mid transition-colors hover:text-ink-base"
                    >
                      {conceptExpanded ? (
                        <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  {conceptExpanded && (
                    <div className="ml-3 border-l border-edge pl-1.5">
                      {g.cities.map((cg) => {
                        const cityKey = `${g.concept}|${cg.city}`;
                        const cityExpanded = isExpanded(cityKey);
                        const cityOn = conceptOn || cg.locations.every((l) => locSet.has(l.id));
                        return (
                          <div key={cityKey} className="mb-0.5">
                            <div className="flex items-center gap-1 rounded-lg pr-1 hover:bg-edge-warm">
                              <button
                                type="button"
                                disabled={conceptOn}
                                onClick={() => toggleCity(cg, cityOn)}
                                title={conceptOn ? "Zahrnuto přes koncept" : undefined}
                                className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left disabled:cursor-default"
                              >
                                <Box checked={cityOn} muted={conceptOn} />
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-soft" strokeWidth={1.5} aria-hidden="true" />
                                <span className={`min-w-0 flex-1 truncate text-[12.5px] ${conceptOn ? "text-ink-mid" : "text-ink-deep"}`}>
                                  {cg.city || "Ostatní"}
                                </span>
                                <span className="font-mono text-[10.5px] text-ink-soft">{cg.locations.length}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleExpand(cityKey)}
                                aria-label={cityExpanded ? "Sbalit" : "Rozbalit"}
                                className="grid h-6 w-6 place-items-center rounded-md text-ink-mid transition-colors hover:text-ink-base"
                              >
                                {cityExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                                )}
                              </button>
                            </div>
                            {cityExpanded && (
                              <div className="ml-3 border-l border-edge pl-1.5">
                                {cg.locations.map((l) => {
                                  const own = locSet.has(l.id);
                                  const checked = conceptOn || cityOn || own;
                                  const inherited = conceptOn || cityOn;
                                  return (
                                    <button
                                      key={l.id}
                                      type="button"
                                      disabled={inherited}
                                      onClick={() => toggleLocation(l.id)}
                                      title={inherited ? "Zahrnuto přes nadřazený výběr" : undefined}
                                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-edge-warm disabled:cursor-default disabled:hover:bg-transparent"
                                    >
                                      <Box checked={checked} muted={inherited} />
                                      <span className={`truncate text-[12.5px] ${inherited ? "text-ink-mid" : "text-ink-deep"}`}>
                                        {l.name}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-edge px-2.5 py-2">
            <button
              type="button"
              onClick={clearAll}
              disabled={empty}
              className="text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base disabled:opacity-40"
            >
              Zrušit výběr
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 items-center rounded-full bg-ink-base px-4 text-[12px] font-semibold text-paper"
            >
              Hotovo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
