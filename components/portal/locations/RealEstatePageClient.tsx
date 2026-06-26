"use client";

import { useState } from "react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import type { LeaseStatus, ReAgent } from "@/lib/portal/locations-db";
import type { RealEstateRow } from "./real-estate-shared";
import type { TransitionField } from "./TransitionSelectCell";
import { RealEstateTable } from "./RealEstateTable";

// Drží rows lokálně, aby se editace promítly hned (optimistic) bez
// router.refresh — sort i filtry se přepočítají z aktuálního stavu. RE agent a
// stav nájmu jdou write-through do Transition; poznámka je lokální v BOServices.
export function RealEstatePageClient({ rows: initialRows }: { rows: RealEstateRow[] }) {
  const [rows, setRows] = useState(initialRows);

  function applyField(id: string, field: TransitionField, value: string | null) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (field === "re_agent") return { ...r, reAgent: value as ReAgent | null };
        if (field === "lease_current_status")
          return { ...r, leaseCurrent: (value ?? "neznamy") as LeaseStatus };
        return { ...r, leaseTarget: (value ?? "neznamy") as LeaseStatus };
      }),
    );
  }

  function applyNote(id: string, note: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, note } : r)));
  }

  function applyReNote(id: string, reNote: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, reNote } : r)));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Franšízing"
        title="Real Estate"
        lede="Lokality z importu NewCo: kdo je má na starost, klíčové NewCo údaje a hlavně jestli aktuální nájem už odpovídá cílovému. RE agenta i stav nájmu upravíte přímo v tabulce (uloží se zpět do Transition), poznámka zůstává lokální."
      />
      <RealEstateTable
        rows={rows}
        onFieldApplied={applyField}
        onNoteApplied={applyNote}
        onReNoteApplied={applyReNote}
      />
    </div>
  );
}
