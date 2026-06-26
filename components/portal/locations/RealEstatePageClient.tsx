"use client";

import { useState } from "react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import type { ReAgent } from "@/lib/portal/locations-db";
import type { RealEstateRow } from "./real-estate-shared";
import { RealEstateTable } from "./RealEstateTable";

// Drží rows lokálně, aby se editace agenta/poznámky promítly hned (optimistic)
// bez router.refresh — sort i filtry se přepočítají z aktuálního stavu.
export function RealEstatePageClient({ rows: initialRows }: { rows: RealEstateRow[] }) {
  const [rows, setRows] = useState(initialRows);

  function applyAgent(id: string, local: string | null, effective: string | null) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              localReAgent: local as ReAgent | null,
              effectiveReAgent: effective as ReAgent | null,
            }
          : r,
      ),
    );
  }

  function applyNote(id: string, note: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, note } : r)));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Franšízing"
        title="Real Estate"
        lede="Lokality z importu NewCo: kdo je má na starost, klíčové NewCo údaje a hlavně jestli aktuální nájem už odpovídá cílovému. RE agenta i poznámku upravíte přímo v tabulce."
      />
      <RealEstateTable rows={rows} onAgentApplied={applyAgent} onNoteApplied={applyNote} />
    </div>
  );
}
