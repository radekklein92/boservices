"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Shop = {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  city: string | null;
  code: string | null;
};
type Loc = { id: string; name: string; code: string | null; concept: string };
type PairState = { locationId: string | null; city: string };
type StatusFilter = "all" | "unpaired" | "paired";

export function PairingEditor({
  shops,
  locations,
  initialPairs,
  suggestions,
  orphaned,
}: {
  shops: Shop[];
  locations: Loc[];
  initialPairs: Record<string, PairState>;
  suggestions: Record<string, string>;
  orphaned: { dwShopId: string; dwShopName: string; city: string }[];
}) {
  const router = useRouter();
  const [pairs, setPairs] = useState<Record<string, PairState>>(initialPairs);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [draftLoc, setDraftLoc] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orphanList, setOrphanList] = useState(orphaned);

  const locName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);

  const pairedCount = shops.filter((s) => pairs[s.id]?.locationId).length;
  const unpairedCount = shops.length - pairedCount;

  const filtered = useMemo(() => {
    const q = search
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    return shops.filter((s) => {
      const isPaired = !!pairs[s.id]?.locationId;
      if (status === "paired" && !isPaired) return false;
      if (status === "unpaired" && isPaired) return false;
      if (!q) return true;
      const hay = `${s.name} ${s.brandName} ${s.city ?? ""} ${s.code ?? ""}`
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [shops, pairs, search, status]);

  function startEdit(s: Shop) {
    setError(null);
    setEditing(s.id);
    setDraftLoc(pairs[s.id]?.locationId ?? suggestions[s.id] ?? "");
    setDraftCity(pairs[s.id]?.city || s.city || "");
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

  async function removeOrphan(dwShopId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/pos/pairing/${encodeURIComponent(dwShopId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setOrphanList((prev) => prev.filter((o) => o.dwShopId !== dwShopId));
      router.refresh();
    } catch {
      setError("Odebrání se nezdařilo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Pobočky</h3>
        <span className="text-[12px] tabular-nums text-ink-mid">
          {pairedCount} spárováno · {unpairedCount} nespárováno
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hledat pobočku…"
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
              {st === "all" ? "Vše" : st === "unpaired" ? "Nespárované" : "Spárované"}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-600">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-ink-mid">Žádná pobočka neodpovídá filtru.</div>
        )}
        {filtered.map((s) => {
          const cur = pairs[s.id];
          const editingThis = editing === s.id;
          const suggestion = suggestions[s.id];
          return (
            <div key={s.id} className="border-b border-edge/60 last:border-0">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink-base">{s.name || "—"}</span>
                    <span className="shrink-0 rounded-md bg-edge-warm px-1.5 py-0.5 text-[10.5px] font-medium text-ink-mid">
                      {s.brandName}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-mid">
                    {cur?.locationId ? (
                      <span className="text-emerald-700">{locName.get(cur.locationId) ?? "napárováno"}</span>
                    ) : suggestion ? (
                      <span className="text-ink-soft">Návrh: {locName.get(suggestion)}</span>
                    ) : (
                      <span className="text-ink-soft">Nespárováno</span>
                    )}
                    {cur?.city ? ` · ${cur.city}` : s.city ? ` · ${s.city}` : ""}
                  </div>
                </div>
                {!editingThis && (
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="shrink-0 rounded-lg border border-edge px-3 py-1.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:bg-edge-warm"
                  >
                    {cur?.locationId ? "Upravit" : "Spárovat"}
                  </button>
                )}
              </div>

              {editingThis && (
                <div className="flex flex-wrap items-end gap-3 border-t border-edge/60 bg-paper-warm px-4 py-3">
                  <label className="flex min-w-[220px] flex-1 flex-col gap-1">
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-mid">Lokalita</span>
                    <select
                      value={draftLoc}
                      onChange={(e) => setDraftLoc(e.target.value)}
                      className="h-9 rounded-lg border border-edge bg-paper px-2.5 text-[13px] text-ink-base outline-none focus:border-ink-base"
                    >
                      <option value="">— Nespárováno —</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                          {l.code ? ` (${l.code})` : ""}
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

      {orphanList.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
            Osiřelé záznamy ({orphanList.length})
          </h3>
          <p className="text-[12px] text-ink-soft">
            Párování k pobočkám, které už v Data Warehouse nejsou. Z analytiky jsou vyloučené.
          </p>
          <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
            {orphanList.map((o) => (
              <div key={o.dwShopId} className="flex items-center gap-3 border-b border-edge/60 px-4 py-2.5 text-[13px] last:border-0">
                <span className="min-w-0 flex-1 truncate text-ink-deep">{o.dwShopName || o.dwShopId}</span>
                {o.city && <span className="shrink-0 text-[12px] text-ink-mid">{o.city}</span>}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeOrphan(o.dwShopId)}
                  className="shrink-0 rounded-lg border border-edge px-3 py-1.5 text-[12.5px] font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                >
                  Odebrat
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
