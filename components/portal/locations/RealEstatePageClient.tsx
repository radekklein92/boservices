"use client";

import { useState } from "react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import type { LeaseStatus, ReAgent } from "@/lib/portal/locations-db";
import type { ReFlag } from "@/lib/portal/re-flags-shared";
import type { LeaseLogEntry } from "@/lib/portal/re-lease-log-db";
import type { RealEstateRow } from "./real-estate-shared";
import type { TransitionField } from "./TransitionSelectCell";
import { RealEstateTable } from "./RealEstateTable";
import { ReLeaseChangeLog } from "./ReLeaseChangeLog";

// Drží rows lokálně, aby se editace promítly hned (optimistic) bez
// router.refresh — sort i filtry se přepočítají z aktuálního stavu. RE agent a
// stav nájmu jdou write-through do Transition; poznámka a flagy jsou lokální
// v BOServices. Katalog flagů (flags) je taky ve stavu — create/edit/delete se
// projeví hned v buňkách i ve filtru.
export function RealEstatePageClient({
  rows: initialRows,
  flags: initialFlags,
  leaseLog,
  currentUserEmail,
  isAdmin,
}: {
  rows: RealEstateRow[];
  flags: ReFlag[];
  leaseLog: LeaseLogEntry[];
  currentUserEmail: string;
  isAdmin: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [flags, setFlags] = useState(initialFlags);

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

  function applyFlags(id: string, flagIds: string[]) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, flagIds } : r)));
  }

  function applySolveDespiteRed(id: string, value: boolean) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, solveDespiteRed: value } : r)),
    );
  }

  // Ruční označení „Červeně" (mimo import NewCo). Optimisticky doplníme kdo/kdy
  // (server vrátí kanonickou hodnotu), ať se chip i red bucket přepočtou hned.
  function applyManualRed(id: string, value: boolean) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              manualRed: value
                ? { by: currentUserEmail, at: new Date().toISOString() }
                : null,
            }
          : r,
      ),
    );
  }

  // Katalog flagů po create/edit (smazání řeší applyFlagDeleted níž).
  function applyCatalog(next: ReFlag[]) {
    setFlags(next);
  }

  // Smazání flagu z katalogu — odebere ho i ze všech řádků (jako orphan cleanup
  // na serveru), ať filtr i buňky odpovídají hned.
  function applyFlagDeleted(flagId: string) {
    setFlags((prev) => prev.filter((f) => f.id !== flagId));
    setRows((prev) =>
      prev.map((r) =>
        r.flagIds.includes(flagId)
          ? { ...r, flagIds: r.flagIds.filter((f) => f !== flagId) }
          : r,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Franšízing"
        title="Real Estate"
        lede="Lokality z importu NewCo: kdo je má na starost a jestli aktuální nájem odpovídá cílovému. RE agenta i stav nájmu upravíte přímo v tabulce."
      />
      <RealEstateTable
        rows={rows}
        flags={flags}
        currentUserEmail={currentUserEmail}
        isAdmin={isAdmin}
        onFieldApplied={applyField}
        onNoteApplied={applyNote}
        onFlagsApplied={applyFlags}
        onSolveDespiteRedApplied={applySolveDespiteRed}
        onManualRedApplied={applyManualRed}
        onCatalogChanged={applyCatalog}
        onFlagDeleted={applyFlagDeleted}
      />
      <ReLeaseChangeLog entries={leaseLog} />
    </div>
  );
}
