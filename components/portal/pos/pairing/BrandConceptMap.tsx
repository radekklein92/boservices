"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Mapa DW značka -> portálový koncept. Slouží k odvození konceptu pobočky, když
// není explicitní override na párování. Sbalitelné (značek ~13).
export function BrandConceptMap({
  brands,
  initialMap,
  concepts,
}: {
  brands: { id: string; name: string }[];
  initialMap: Record<string, string>;
  concepts: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [map, setMap] = useState<Record<string, string>>(initialMap);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) if (v) clean[k] = v;
    try {
      const res = await fetch("/api/portal/pos/pairing/brand-map", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clean),
      });
      if (!res.ok) throw new Error();
      setMsg("Uloženo.");
      router.refresh();
    } catch {
      setMsg("Uložení se nezdařilo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-2xl border border-edge bg-paper">
      <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-semibold text-ink-base marker:hidden">
        Mapa značka → koncept{" "}
        <span className="font-normal text-ink-mid">({brands.length} značek)</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-edge px-4 py-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {brands.map((b) => (
            <label key={b.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-deep">{b.name}</span>
              <select
                value={map[b.id] ?? ""}
                onChange={(e) => setMap((prev) => ({ ...prev, [b.id]: e.target.value }))}
                className="h-9 w-[140px] shrink-0 rounded-lg border border-edge bg-paper px-2.5 text-[13px] text-ink-base outline-none focus:border-ink-base"
              >
                <option value="">—</option>
                {concepts.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="h-9 rounded-lg bg-ink-base px-3.5 text-[12.5px] font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Uložit mapování
          </button>
          {msg && <span className="text-[12.5px] text-ink-mid">{msg}</span>}
        </div>
      </div>
    </details>
  );
}
