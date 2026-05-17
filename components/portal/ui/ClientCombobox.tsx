"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { Client } from "@/lib/portal/clients-db";

type Props = {
  clients: Client[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  autoFocus?: boolean;
};

export function ClientCombobox({
  clients,
  value,
  onChange,
  placeholder = "Hledat klienta podle jména nebo IČO…",
  emptyMessage = "Žádný klient se neshoduje.",
  autoFocus = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => clients.find((c) => c.id === value) ?? null,
    [clients, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients
      .filter((c) => {
        const haystack = [
          c.companyName,
          c.ico,
          c.dic,
          c.address.city,
          c.statutory?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 50);
  }, [clients, query]);

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

  function selectClient(id: string) {
    onChange(id);
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
      selectClient(filtered[highlight]!.id);
    }
  }

  const showSelectedChip = !open && selected;

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
            <span className="truncate font-medium">{selected.companyName}</span>
            {selected.ico && (
              <span className="font-mono text-[11.5px] text-ink-mid">
                · {selected.ico}
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
            placeholder={placeholder}
            className="h-10 w-full rounded-lg border border-edge bg-paper pl-9 pr-10 text-[13.5px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls="client-combobox-list"
          />
        )}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            if (open && selected) {
              setOpen(false);
              setQuery("");
            } else if (selected && !open) {
              onChange("");
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            } else {
              setOpen((v) => !v);
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          }}
          aria-label={selected ? "Změnit klienta" : "Otevřít"}
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
              {clients.length === 0 ? "Žádní klienti." : emptyMessage}
            </div>
          ) : (
            <ul id="client-combobox-list" role="listbox" className="py-1">
              {filtered.map((c, idx) => {
                const isActive = idx === highlight;
                const isSelected = c.id === value;
                return (
                  <li key={c.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => selectClient(c.id)}
                      className={[
                        "flex w-full items-baseline gap-3 px-3.5 py-2 text-left transition-colors",
                        isActive ? "bg-paper-warm" : "bg-paper",
                      ].join(" ")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink-base">
                          {c.companyName}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-mid">
                          {c.ico ? (
                            <>
                              <span className="font-mono">{c.ico}</span>
                              {" · "}
                            </>
                          ) : null}
                          {c.address.city}
                        </span>
                      </span>
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
              {clients.length > filtered.length && (
                <li className="border-t border-edge px-3.5 py-2 text-[11px] text-ink-mid">
                  Zobrazeno {filtered.length} z {clients.length}. Upřesněte
                  hledání.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
