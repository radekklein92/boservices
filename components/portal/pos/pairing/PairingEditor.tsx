"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, EyeOff, RotateCcw, Search, Sparkles, X } from "lucide-react";

type Shop = { id: string; name: string; brandId: string; brandName: string; city: string | null };
type Loc = { id: string; name: string; code: string | null };
type PairState = { locationId: string | null; city: string };
type StatusFilter = "all" | "unpaired" | "paired" | "ignored";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Shop-primary párování: seznam POKLADEN (DW shops), ke každé se vybírá PRODEJNA
// (lokalita portálu) přes našeptávač. Vztah 1 prodejna <-> N pokladen. Město
// navrhuje AI z názvu pokladny + prodejny. Pokladny mimo portál lze ignorovat.
export function PairingEditor({
  shops,
  locations,
  initialPairs,
  suggestions,
  ignoredShopIds,
}: {
  shops: Shop[];
  locations: Loc[];
  initialPairs: Record<string, PairState>;
  suggestions: Record<string, string>;
  ignoredShopIds: string[];
}) {
  const router = useRouter();
  const [pairs, setPairs] = useState<Record<string, PairState>>(initialPairs);
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set(ignoredShopIds));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [draftLoc, setDraftLoc] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [cityTouched, setCityTouched] = useState(false);
  const [citySource, setCitySource] = useState<"ai" | "hint" | null>(null);
  const [citySuggesting, setCitySuggesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);

  // Živý počet pokladen na prodejně (server snapshot + lokální změny) pro hint
  // v našeptávači "už má N pokladen".
  const liveCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of Object.values(pairs)) if (p.locationId) m[p.locationId] = (m[p.locationId] ?? 0) + 1;
    return m;
  }, [pairs]);

  const pairedCount = shops.filter((s) => pairs[s.id]?.locationId).length;
  const ignoredCount = shops.filter((s) => ignored.has(s.id)).length;

  const filtered = useMemo(() => {
    const q = norm(search);
    return shops.filter((s) => {
      const isIgnored = ignored.has(s.id);
      if (status === "ignored") {
        if (!isIgnored) return false;
      } else {
        if (isIgnored) return false;
        const isPaired = !!pairs[s.id]?.locationId;
        if (status === "paired" && !isPaired) return false;
        if (status === "unpaired" && isPaired) return false;
      }
      if (!q) return true;
      return norm(`${s.name} ${s.brandName} ${s.city ?? ""}`).includes(q);
    });
  }, [shops, pairs, ignored, search, status]);

  const unpairedLocations = useMemo(
    () => locations.filter((l) => !(liveCount[l.id] > 0)),
    [locations, liveCount],
  );

  // AI návrh města; přepíše draftCity jen když pole není ručně editované (nebo force).
  async function suggestCity(shop: Shop, locId: string, force: boolean) {
    setCitySuggesting(true);
    try {
      const res = await fetch("/api/portal/pos/pairing/suggest-city", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: shop.name,
          locationName: locId ? locName.get(locId) ?? "" : "",
          cityHint: shop.city ?? "",
        }),
      });
      const data = await res.json();
      const city = typeof data?.city === "string" ? data.city : "";
      if (city && (force || !cityTouched)) {
        setDraftCity(city);
        setCitySource(data?.source === "ai" ? "ai" : "hint");
        if (force) setCityTouched(false);
      }
    } catch {
      // ticho - město se doplní ručně
    } finally {
      setCitySuggesting(false);
    }
  }

  function startEdit(s: Shop) {
    setError(null);
    setEditing(s.id);
    const loc = pairs[s.id]?.locationId ?? suggestions[s.id] ?? "";
    const existingCity = pairs[s.id]?.city ?? "";
    setDraftLoc(loc);
    setDraftCity(existingCity);
    setCitySource(null);
    setCityTouched(!!existingCity);
    if (!existingCity) void suggestCity(s, loc, false);
  }

  function onLocChange(s: Shop, locId: string) {
    setDraftLoc(locId);
    if (!cityTouched) void suggestCity(s, locId, false);
  }

  async function save(s: Shop) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/pos/pairing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dwShopId: s.id,
          locationId: draftLoc || null,
          city: draftCity.trim(),
          brandId: s.brandId,
          dwShopName: s.name,
        }),
      });
      if (!res.ok) throw new Error();
      setPairs((prev) => ({ ...prev, [s.id]: { locationId: draftLoc || null, city: draftCity.trim() } }));
      setEditing(null);
      router.refresh();
    } catch {
      setError("Uložení se nezdařilo. Zkuste to znovu.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleIgnore(s: Shop, ignore: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/pos/pairing/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dwShopId: s.id, ignore }),
      });
      if (!res.ok) throw new Error();
      setIgnored((prev) => {
        const next = new Set(prev);
        if (ignore) next.add(s.id);
        else next.delete(s.id);
        return next;
      });
      if (editing === s.id) setEditing(null);
      router.refresh();
    } catch {
      setError("Akce se nezdařila. Zkuste to znovu.");
    } finally {
      setBusy(false);
    }
  }

  const TABS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Vše" },
    { key: "unpaired", label: "Nenapárované" },
    { key: "paired", label: "Napárované" },
    { key: "ignored", label: `Ignorované${ignoredCount ? ` (${ignoredCount})` : ""}` },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Pokladny</h3>
        <span className="text-[12px] tabular-nums text-ink-mid">
          {pairedCount} s prodejnou · {shops.length - pairedCount - ignoredCount} bez
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hledat pokladnu…"
          className="ml-auto h-9 w-full max-w-[260px] rounded-lg border border-edge bg-paper px-3 text-[13px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
        />
        <div className="inline-flex rounded-lg border border-edge p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatus(t.key)}
              className={`h-8 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                status === t.key ? "bg-ink-base text-paper" : "text-ink-mid hover:text-ink-base"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-600">{error}</div>}

      <div className="rounded-2xl border border-edge bg-paper">
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-ink-mid">Žádná pokladna neodpovídá filtru.</div>
        )}
        {filtered.map((s) => {
          const cur = pairs[s.id];
          const editingThis = editing === s.id;
          const suggestion = suggestions[s.id];
          const isIgnored = ignored.has(s.id);
          return (
            <div key={s.id} className="border-b border-edge/60 last:border-0">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`truncate font-medium ${isIgnored ? "text-ink-mid line-through" : "text-ink-base"}`}>
                      {s.name}
                    </span>
                    <span className="shrink-0 rounded-md bg-edge-warm px-1.5 py-0.5 text-[10.5px] font-medium text-ink-mid">
                      {s.brandName}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-mid">
                    {isIgnored ? (
                      <span className="text-ink-soft">Ignorováno</span>
                    ) : cur?.locationId ? (
                      <span className="text-emerald-700">{locName.get(cur.locationId) ?? "napárováno"}</span>
                    ) : suggestion ? (
                      <span className="text-ink-soft">Návrh: {locName.get(suggestion)}</span>
                    ) : (
                      <span className="text-ink-soft">Bez prodejny</span>
                    )}
                    {!isIgnored && (cur?.city ? ` · ${cur.city}` : s.city ? ` · ${s.city}` : "")}
                  </div>
                </div>
                {!editingThis && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isIgnored ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toggleIgnore(s, false)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:bg-edge-warm disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        Obnovit
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          className="rounded-lg border border-edge px-3 py-1.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:bg-edge-warm"
                        >
                          {cur?.locationId ? "Upravit" : "Vybrat prodejnu"}
                        </button>
                        {!cur?.locationId && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleIgnore(s, true)}
                            title="Vyřadit z párování (cizí provozovna, akční kasa…)"
                            className="grid h-8 w-8 place-items-center rounded-lg border border-edge text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base disabled:opacity-50"
                            aria-label="Ignorovat pokladnu"
                          >
                            <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {editingThis && (
                <div className="flex flex-wrap items-end gap-3 border-t border-edge/60 bg-paper-warm px-4 py-3">
                  <label className="flex min-w-[260px] flex-1 flex-col gap-1">
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-mid">Prodejna</span>
                    <ProdejnaCombobox
                      value={draftLoc}
                      locations={locations}
                      countByLoc={liveCount}
                      currentLoc={cur?.locationId ?? null}
                      onChange={(id) => onLocChange(s, id)}
                    />
                  </label>
                  <label className="flex w-[200px] flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-mid">
                      Město
                      {citySource === "ai" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-edge-warm px-1.5 py-0.5 text-[9px] font-semibold tracking-normal text-ink-mid">
                          <Sparkles className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
                          AI
                        </span>
                      )}
                    </span>
                    <div className="relative">
                      <input
                        type="text"
                        value={draftCity}
                        onChange={(e) => {
                          setDraftCity(e.target.value);
                          setCityTouched(true);
                          setCitySource(null);
                        }}
                        placeholder={citySuggesting ? "Navrhuji…" : "Praha"}
                        className="h-9 w-full rounded-lg border border-edge bg-paper pl-3 pr-9 text-[13px] text-ink-base outline-none placeholder:text-ink-soft focus:border-ink-base"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        disabled={citySuggesting}
                        onClick={() => void suggestCity(s, draftLoc, true)}
                        title="Navrhnout město AI"
                        aria-label="Navrhnout město AI"
                        className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base disabled:opacity-50"
                      >
                        <Sparkles
                          className={`h-3.5 w-3.5 ${citySuggesting ? "animate-pulse" : ""}`}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => save(s)}
                      className="h-9 rounded-lg bg-ink-base px-3.5 text-[12.5px] font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      Uložit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditing(null)}
                      className="h-9 rounded-lg border border-edge px-3 text-[12.5px] font-medium text-ink-deep transition-colors hover:bg-edge-warm disabled:opacity-50"
                    >
                      Zrušit
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {unpairedLocations.length > 0 && (
        <details className="mt-2 rounded-2xl border border-edge bg-paper">
          <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-semibold text-ink-base marker:hidden">
            Prodejny bez pokladny{" "}
            <span className="font-normal text-ink-mid">({unpairedLocations.length})</span>
          </summary>
          <div className="flex flex-col gap-1 border-t border-edge px-4 py-3">
            <p className="mb-1 text-[11px] text-ink-soft">Lokality portálu, které zatím nemají přiřazenou pokladnu.</p>
            {unpairedLocations.map((l) => (
              <div key={l.id} className="flex items-center gap-2 py-1 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate text-ink-deep">{l.name}</span>
                {l.code && <span className="shrink-0 text-[11px] text-ink-mid">{l.code}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

// Inline našeptávač prodejny nad seznamem lokalit v paměti (žádný fetch). Ukazuje
// kód lokality a hint "už N pokladen" - jedna prodejna může mít víc pokladen.
function ProdejnaCombobox({
  value,
  locations,
  countByLoc,
  currentLoc,
  onChange,
}: {
  value: string;
  locations: Loc[];
  countByLoc: Record<string, number>;
  currentLoc: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => locations.find((l) => l.id === value) ?? null, [locations, value]);

  const filtered = useMemo(() => {
    const q = norm(query);
    const list = q
      ? locations.filter((l) => norm(`${l.name} ${l.code ?? ""}`).includes(q))
      : locations;
    return list.slice(0, 50);
  }, [locations, query]);

  useEffect(() => setHighlight(0), [filtered.length, open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    } else if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter" && filtered[highlight]) {
      e.preventDefault();
      pick(filtered[highlight]!.id);
    }
  }

  const showChip = !open && !!selected;

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mid"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        {showChip ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setQuery("");
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="flex h-9 w-full items-center gap-2 rounded-lg border border-edge bg-paper pl-9 pr-9 text-left text-[13px] text-ink-base outline-none transition-colors hover:border-ink-base"
          >
            <span className="truncate font-medium">{selected!.name}</span>
            {selected!.code && <span className="shrink-0 font-mono text-[11px] text-ink-mid">· {selected!.code}</span>}
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
            placeholder="Hledat prodejnu podle názvu nebo kódu…"
            className="h-9 w-full rounded-lg border border-edge bg-paper pl-9 pr-9 text-[13px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
          />
        )}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            if (value && showChip) {
              onChange("");
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            } else {
              setOpen((v) => !v);
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          }}
          aria-label={value ? "Změnit prodejnu" : "Otevřít"}
          className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
        >
          {showChip ? (
            <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-[280px] overflow-y-auto rounded-lg border border-edge bg-paper shadow-[0_12px_28px_-12px_rgba(14,14,14,0.25)]">
          {filtered.length === 0 ? (
            <div className="px-3.5 py-4 text-[12.5px] text-ink-mid">Žádná prodejna se neshoduje.</div>
          ) : (
            <ul role="listbox" className="py-1">
              {filtered.map((l, idx) => {
                const isActive = idx === highlight;
                const isSelected = l.id === value;
                // Počet JINÝCH pokladen už na této prodejně (bez té právě editované).
                const others = (countByLoc[l.id] ?? 0) - (l.id === currentLoc ? 1 : 0);
                return (
                  <li key={l.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => pick(l.id)}
                      className={`flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors ${
                        isActive ? "bg-paper-warm" : "bg-paper"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink-base">{l.name}</span>
                        <span className="mt-0.5 block text-[11px] text-ink-mid">
                          {l.code && <span className="font-mono">{l.code}</span>}
                          {others > 0 && (
                            <span className="text-amber-700">
                              {l.code ? " · " : ""}
                              už {others} {others === 1 ? "pokladna" : others < 5 ? "pokladny" : "pokladen"}
                            </span>
                          )}
                        </span>
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-ink-base" strokeWidth={1.5} aria-hidden="true" />}
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
