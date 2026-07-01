"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Pencil, X } from "lucide-react";

// Buňka sloupce „Červeně". Zvládá všechny stavy lokality:
//   - NEČERVENÁ: neutrální chip „Ne"/„—", klepnutím se označí RUČNĚ (mimo import
//     NewCo) → přesune se do kategorie „Červeně" (defaultně skrytá).
//   - ČERVENÁ Z IMPORTU (flaggedRed): plný červený chip; klepnutím cykluje + řešit.
//   - ČERVENÁ RUČNĚ (manualRed, ne z importu): červený chip s čárkovaným okrajem
//     a štítkem „ručně" (vizuálně odlišené od importu, tooltip kdo/kdy); klepnutím
//     cykluje + řešit, křížkem se ruční označení zruší.
// „+ řešit" = lokální solveDespiteRed: červená je jinak samostatná kategorie, s
// tímto příznakem se navíc vždy ukáže i ve filtru „Řešit". Zdroj pravdy display
// jsou propy (rodič dělá optimistický update → tabulka hned přefiltruje/přeřadí);
// tady držíme jen saving/error a na chybě voláme rollback callbacku.
export function RedFlagCell({
  id,
  importRed,
  manualRed,
  solveDespiteRed,
  hasNewco,
  onSolveApplied,
  onManualRedApplied,
}: {
  id: string;
  importRed: boolean;
  manualRed: { by: string; at: string } | null;
  solveDespiteRed: boolean;
  hasNewco: boolean;
  onSolveApplied: (value: boolean) => void;
  onManualRedApplied: (value: boolean) => void;
}) {
  const [savingSolve, setSavingSolve] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [error, setError] = useState(false);

  const isRed = importRed || manualRed !== null;
  const manualOnly = manualRed !== null && !importRed;

  async function toggleSolve() {
    if (savingSolve) return;
    const next = !solveDespiteRed;
    setError(false);
    setSavingSolve(true);
    onSolveApplied(next); // optimistic: tabulka hned přefiltruje/přeřadí
    try {
      const res = await fetch(`/api/portal/locations/${id}/solve-despite-red`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "save failed");
    } catch {
      onSolveApplied(!next); // rollback
      setError(true);
    } finally {
      setSavingSolve(false);
    }
  }

  async function setManual(next: boolean) {
    if (savingManual) return;
    setError(false);
    setSavingManual(true);
    onManualRedApplied(next); // optimistic
    try {
      const res = await fetch(`/api/portal/locations/${id}/manual-red`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "save failed");
    } catch {
      onManualRedApplied(!next); // rollback
      setError(true);
    } finally {
      setSavingManual(false);
    }
  }

  // ── Nečervená: nabídnout ruční označení ──────────────────────────────────────
  if (!isRed) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setManual(true);
        }}
        disabled={savingManual}
        title="Označit ručně jako Červeně. Lokalita se přesune do samostatné kategorie Červeně (ve výchozím stavu skrytá); v buňce pak půjde zapnout i + řešit."
        className="group/red inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-edge bg-edge-warm py-1 pl-2 pr-2.5 text-[11.5px] font-medium text-ink-soft transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {savingManual ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" strokeWidth={2} aria-hidden="true" />
        ) : (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-soft/40 transition-colors group-hover/red:bg-red-500"
            aria-hidden="true"
          />
        )}
        {hasNewco ? "Ne" : "—"}
        {error && <span className="ml-0.5 text-[10px] text-red-600">chyba</span>}
      </button>
    );
  }

  // ── Červená (import nebo ručně): chip cykluje + řešit; ručně lze zrušit ──────
  const manualWhen = manualRed
    ? new Date(manualRed.at).toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        timeZone: "Europe/Prague",
      })
    : "";
  const chipTitle = manualOnly
    ? `Ručně označeno jako Červeně (${manualRed?.by ?? ""}, ${manualWhen}). ${
        solveDespiteRed
          ? "Klepnutím vrátíte na jen Červeně."
          : "Klepnutím přidáte + řešit, takže se ukáže i ve filtru Řešit."
      }`
    : solveDespiteRed
      ? "Červeně + řešit: ukazuje se i ve filtru Řešit. Klepnutím vrátíte na jen Červeně."
      : "Červeně (samostatná kategorie, ve výchozím stavu skrytá). Klepnutím přidáte + řešit, takže se ukáže i ve filtru Řešit.";

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleSolve();
        }}
        disabled={savingSolve}
        title={chipTitle}
        className={`group/red inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-red-50 py-1 pl-2 pr-2.5 text-[11.5px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 ${
          manualOnly ? "border-dashed border-red-400" : "border-red-300"
        }`}
      >
        {savingSolve ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" strokeWidth={2} aria-hidden="true" />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
        )}
        Červeně
        {manualOnly && (
          <span className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-600">
            <Pencil className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
            ručně
          </span>
        )}
        {solveDespiteRed && (
          <span className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-amber-700">
            <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
            řešit
          </span>
        )}
        {error && <span className="ml-0.5 text-[10px] text-red-600">chyba</span>}
      </button>
      {manualOnly && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setManual(false);
          }}
          disabled={savingManual}
          title="Zrušit ruční označení jako Červeně"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-edge bg-paper text-ink-soft transition-colors hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingManual ? (
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} aria-hidden="true" />
          ) : (
            <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      )}
    </span>
  );
}
