"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Loc = { id: string; name: string; code: string | null };
type Shop = { id: string; name: string; brandId: string; brandName: string; city: string | null };
type PairState = { dwShopId: string | null; city: string };
type StatusFilter = "all" | "unpaired" | "paired";

// Location-primary párování: seznam LOKALIT portálu, ke každé se přiřazuje
// pokladna (DW shop). Zápis přes /api/portal/pos/pairing/by-location (drží
// integritu 1 lokalita <-> 1 pokladna).
export function PairingEditor({
  locations,
  shops,
  initialPairs,
  suggestions,
}: {
  locations: Loc[];
  shops: Shop[];
  initialPairs: Record<string, PairState>;
  suggestions: Record<string, string>;
  unpairedShops?: { id: string; name: string; brandName: string }[];
}) {
  const router = useRouter();
  const [pairs, setPairs] = useState<Record<string, PairState>>(initialPairs);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [draftShop, setDraftShop] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shopById = useMemo(() => new Map(shops.map((s) => [s.id, s])), [shops]);

  const assigned = useMemo(() => {
    const set = new Set<string>();
    for (const p of Object.values(pairs)) if (p.dwShopId) set.add(p.dwShopId);
    return set;
  }, [pairs]);
  const unpaired = useMemo(() => shops.filter((s) => !assigned.has(s.id)), [shops, assigned]);

  const pairedCount = locations.filter((l) => pairs[l.id]?.dwShopId).length;

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const filtered = useMemo(() => {
    const q = norm(search);
    return locations.filter((l) => {
      const isPaired = !!pairs[l.id]?.dwShopId;
      if (status === "paired" && !isPaired) return false;
      if (status === "unpaired" && isPaired) return false;
      if (!q) return true;
      return norm(`${l.name} ${l.code ?? ""}`).includes(q);
    });
  }, [locations, pairs, search, status]);

  function startEdit(loc: Loc) {
    setError(null);
    setEditing(loc.id);
    const cur = pairs[loc.id];
    setDraftShop(cur?.dwShopId ?? suggestions[loc.id] ?? "");
    setDraftCity(cur?.city || (cur?.dwShopId ? shopById.get(cur.dwShopId)?.city : "") || "");
  }

  async function save(loc: Loc) {
    setBusy(true);
    setError(null);
    const shop = draftShop ? shopById.get(draftShop) : undefined;
    try {
      const res = await fetch("/api/portal/pos/pairing/by-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: loc.id,
          dwShopId: draftShop || null,
          city: draftCity.trim(),
          brandId: shop?.brandId,
          dwShopName: shop?.name,
        }),
      });
      if (!res.ok) throw new Error();
      setPairs((prev) => ({ ...prev, [loc.id]: { dwShopId: draftShop || null, city: draftCity.trim() } }));
      setEditing(null);
      router.refresh();
    } catch {
      setError("Uložení se nezdařilo. Zkuste to znovu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Lokality</h3>
        <span className="text-[12px] tabular-nums text-ink-mid">
          {pairedCount} s pokladnou · {locations.length - pairedCount} bez
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hledat lokalitu…"
          className="ml-auto h-9 w-full max-w-[260px] rounded-lg border border-edge bg-paper px-3 text-[13px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
        />
        <div className="inline-flex rounded-lg border border-edge p-0.5">
          {(["all", "unpaired", "paired"] as StatusFilter[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatus(st)}
              className={`h-8 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                status === st ? "bg-ink-base text-paper" : "text-ink-mid hover:text-ink-base"
              }`}
            >
              {st === "all" ? "Vše" : st === "unpaired" ? "Bez pokladny" : "S pokladnou"}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-600">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-ink-mid">Žádná lokalita neodpovídá filtru.</div>
        )}
        {filtered.map((loc) => {
          const cur = pairs[loc.id];
          const editingThis = editing === loc.id;
          const suggestion = suggestions[loc.id];
          return (
            <div key={loc.id} className="border-b border-edge/60 last:border-0">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink-base">{loc.name}</span>
                    {loc.code && (
                      <span className="shrink-0 rounded-md bg-edge-warm px-1.5 py-0.5 text-[10.5px] font-medium text-ink-mid">
                        {loc.code}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-mid">
                    {cur?.dwShopId ? (
                      <span className="text-emerald-700">
                        {shopById.get(cur.dwShopId)?.name ?? "napárováno"}
                      </span>
                    ) : suggestion ? (
                      <span className="text-ink-soft">Návrh: {shopById.get(suggestion)?.name}</span>
                    ) : (
                      <span className="text-ink-soft">Bez pokladny</span>
                    )}
                    {cur?.city ? ` · ${cur.city}` : ""}
                  </div>
                </div>
                {!editingThis && (
                  <button
                    type="button"
                    onClick={() => startEdit(loc)}
                    className="shrink-0 rounded-lg border border-edge px-3 py-1.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:bg-edge-warm"
                  >
                    {cur?.dwShopId ? "Upravit" : "Přiřadit pokladnu"}
                  </button>
                )}
              </div>

              {editingThis && (
                <div className="flex flex-wrap items-end gap-3 border-t border-edge/60 bg-paper-warm px-4 py-3">
                  <label className="flex min-w-[240px] flex-1 flex-col gap-1">
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-mid">Pokladna</span>
                    <select
                      value={draftShop}
                      onChange={(e) => setDraftShop(e.target.value)}
                      className="h-9 rounded-lg border border-edge bg-paper px-2.5 text-[13px] text-ink-base outline-none focus:border-ink-base"
                    >
                      <option value="">— Bez pokladny —</option>
                      {shops.map((s) => (
                        <option key={s.id} value={s.id} disabled={assigned.has(s.id) && s.id !== cur?.dwShopId}>
                          {s.name} · {s.brandName}
                          {assigned.has(s.id) && s.id !== cur?.dwShopId ? " (obsazeno)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex w-[160px] flex-col gap-1">
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-mid">Město</span>
                    <input
                      type="text"
                      value={draftCity}
                      onChange={(e) => setDraftCity(e.target.value)}
                      placeholder="Praha"
                      className="h-9 rounded-lg border border-edge bg-paper px-3 text-[13px] text-ink-base outline-none placeholder:text-ink-soft focus:border-ink-base"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => save(loc)}
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

      {unpaired.length > 0 && (
        <details className="mt-2 rounded-2xl border border-edge bg-paper">
          <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-semibold text-ink-base marker:hidden">
            Nenapárované pokladny{" "}
            <span className="font-normal text-ink-mid">({unpaired.length})</span>
          </summary>
          <div className="flex flex-col gap-1 border-t border-edge px-4 py-3">
            <p className="mb-1 text-[11px] text-ink-soft">
              Pokladny z Data Warehouse, které zatím nejsou přiřazené k žádné lokalitě.
            </p>
            {unpaired.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-1 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate text-ink-deep">{s.name}</span>
                <span className="shrink-0 text-[11px] text-ink-mid">{s.brandName}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
