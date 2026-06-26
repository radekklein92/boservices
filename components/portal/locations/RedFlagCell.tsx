"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

// Buňka sloupce „Červeně" pro lokalitu označenou v NewCo červeně. Cyklující chip:
//   [● Červeně]  ↔  [● Červeně + řešit]
// „+ řešit" = lokální příznak solveDespiteRed (write-through do BOServices přes
// /solve-despite-red). Když je zapnutý, lokalita zůstane v kategorii „Červeně"
// a NAVÍC se vždy započítá do filtru „Řešit". Optimistický update (onApplied
// hned, ať tabulka přefiltruje/přeřadí), na chybě rollback.
export function RedFlagCell({
  id,
  solveDespiteRed,
  onApplied,
}: {
  id: string;
  solveDespiteRed: boolean;
  onApplied: (value: boolean) => void;
}) {
  const [value, setValue] = useState(solveDespiteRed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Sync z venku (refresh / cizí změna), pokud zrovna neukládáme.
  useEffect(() => {
    if (!saving) setValue(solveDespiteRed);
  }, [solveDespiteRed, saving]);

  async function toggle() {
    if (saving) return;
    const next = !value;
    const prev = value;
    setValue(next);
    setError(false);
    setSaving(true);
    onApplied(next); // optimistic: tabulka hned přefiltruje/přeřadí
    try {
      const res = await fetch(`/api/portal/locations/${id}/solve-despite-red`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "save failed");
    } catch {
      setValue(prev);
      onApplied(prev); // rollback
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      disabled={saving}
      title={
        value
          ? "Červeně + řešit: ukazuje se i ve filtru Řešit. Klepnutím vrátíte na jen Červeně."
          : "Červeně (samostatná kategorie, ve výchozím stavu skrytá). Klepnutím přidáte + řešit, takže se ukáže i ve filtru Řešit."
      }
      className="group/red inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-red-300 bg-red-50 py-1 pl-2 pr-2.5 text-[11.5px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {saving ? (
        <Loader2
          className="h-3 w-3 shrink-0 animate-spin"
          strokeWidth={2}
          aria-hidden="true"
        />
      ) : (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
          aria-hidden="true"
        />
      )}
      Červeně
      {value && (
        <span className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-amber-700">
          <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
          řešit
        </span>
      )}
      {error && <span className="ml-0.5 text-[10px] text-red-600">chyba</span>}
    </button>
  );
}
