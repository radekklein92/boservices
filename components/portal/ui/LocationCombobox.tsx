"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { LocationPickItem } from "@/app/api/portal/locations/route";
import {
  CATEGORY_LABEL,
  CATEGORY_STYLE,
  CONCEPT_LABEL,
} from "@/components/portal/locations/locations-shared";
import type {
  LocationCategory,
  LocationConcept,
} from "@/lib/portal/locations-db";

export type { LocationPickItem };

type Props = {
  value: string;
  onChange: (id: string, item: LocationPickItem | null) => void;
  // Předvyplněný popisek vybrané lokality (když rodič zná snapshot, ale picker
  // ještě nenačetl seznam) - např. na detailu smlouvy.
  selectedName?: string;
  placeholder?: string;
  autoFocus?: boolean;
};

export function LocationCombobox({
  value,
  onChange,
  selectedName,
  placeholder = "Hledat lokalitu podle názvu nebo kódu…",
  autoFocus = false,
}: Props) {
  const [items, setItems] = useState<LocationPickItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/portal/locations", { cache: "no-store" });
        const data = await res.json();
        if (active && data.ok) setItems(data.locations as LocationPickItem[]);
      } catch {
        // ticho - prázdný seznam degraduje gracefully
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => items.find((l) => l.id === value) ?? null,
    [items, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items
      .filter((l) => {
        const haystack = [l.name, l.code, l.concept]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 50);
  }, [items, query]);

  useEffect(() => {
    setHighlight(0);
  }, [filtered.length, open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function selectItem(item: LocationPickItem) {
    onChange(item.id, item);
    setOpen(false);
    setQuery("");
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
      return;
    }
    if (e.key === "Enter" && filtered[highlight]) {
      e.preventDefault();
      selectItem(filtered[highlight]!);
    }
  }

  const label = selected?.name ?? (value ? selectedName : undefined);
  const showSelectedChip = !open && !!label;

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mid"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        {showSelectedChip ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setQuery("");
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="flex h-10 w-full items-center gap-2 rounded-lg border border-edge bg-paper pl-9 pr-10 text-left text-[13.5px] text-ink-base outline-none transition-colors hover:border-ink-base focus:border-ink-base"
          >
            <span className="truncate font-medium">{label}</span>
            {selected?.code && (
              <span className="font-mono text-[11.5px] text-ink-mid">
                · {selected.code}
              </span>
            )}
          </button>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            placeholder={loading ? "Načítám lokality…" : placeholder}
            className="h-10 w-full rounded-lg border border-edge bg-paper pl-9 pr-10 text-[13.5px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls="location-combobox-list"
          />
        )}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            if (open && value) {
              setOpen(false);
              setQuery("");
            } else if (value && !open) {
              onChange("", null);
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            } else {
              setOpen((v) => !v);
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          }}
          aria-label={value ? "Změnit lokalitu" : "Otevřít"}
          className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
        >
          {showSelectedChip ? (
            <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-[280px] overflow-y-auto rounded-lg border border-edge bg-paper shadow-[0_12px_28px_-12px_rgba(14,14,14,0.25)]">
          {filtered.length === 0 ? (
            <div className="px-3.5 py-4 text-[12.5px] text-ink-mid">
              {loading
                ? "Načítám lokality…"
                : items.length === 0
                  ? "Žádné lokality."
                  : "Žádná lokalita se neshoduje."}
            </div>
          ) : (
            <ul id="location-combobox-list" role="listbox" className="py-1">
              {filtered.map((l, idx) => {
                const isActive = idx === highlight;
                const isSelected = l.id === value;
                return (
                  <li key={l.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => selectItem(l)}
                      className={[
                        "flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors",
                        isActive ? "bg-paper-warm" : "bg-paper",
                      ].join(" ")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink-base">
                          {l.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-mid">
                          {l.code ? (
                            <>
                              <span className="font-mono">{l.code}</span>
                              {" · "}
                            </>
                          ) : null}
                          {CONCEPT_LABEL[l.concept as LocationConcept] ?? l.concept}
                        </span>
                      </span>
                      {l.category && (
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${CATEGORY_STYLE[l.category as LocationCategory]}`}
                        >
                          {CATEGORY_LABEL[l.category as LocationCategory]}
                        </span>
                      )}
                      {isSelected && (
                        <Check
                          className="h-3.5 w-3.5 shrink-0 text-ink-base"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
