"use client";

import { useState } from "react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import type { LeaseStatus, ReAgent } from "@/lib/portal/locations-db";
import type { ReFlag } from "@/lib/portal/re-flags-shared";
import type { RealEstateRow } from "./real-estate-shared";
import type { TransitionField } from "./TransitionSelectCell";
import { RealEstateTable } from "./RealEstateTable";

// Drží rows lokálně, aby se editace promítly hned (optimistic) bez
// router.refresh — sort i filtry se přepočítají z aktuálního stavu. RE agent a
// stav nájmu jdou write-through do Transition; poznámka a flagy jsou lokální
// v BOServices. Katalog flagů (flags) je taky ve stavu — create/edit/delete se
// projeví hned v buňkách i ve filtru.
export function RealEstatePageClient({
  rows: initialRows,
  flags: initialFlags,
  currentUserEmail,
  isAdmin,
}: {
  rows: RealEstateRow[];
  flags: ReFlag[];
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

  function applyReNote(id: string, reNote: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, reNote } : r)));
  }

  function applyFlags(id: string, flagIds: string[]) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, flagIds } : r)));
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
        lede="Lokality z importu NewCo: kdo je má na starost, klíčové NewCo údaje a hlavně jestli aktuální nájem už odpovídá cílovému. RE agenta i stav nájmu upravíte přímo v tabulce (uloží se zpět do Transition), poznámka a flagy zůstávají lokální. Flagy jsou sdílené napříč týmem."
      />
      <RealEstateTable
        rows={rows}
        flags={flags}
        currentUserEmail={currentUserEmail}
        isAdmin={isAdmin}
        onFieldApplied={applyField}
        onNoteApplied={applyNote}
        onReNoteApplied={applyReNote}
        onFlagsApplied={applyFlags}
        onCatalogChanged={applyCatalog}
        onFlagDeleted={applyFlagDeleted}
      />
    </div>
  );
}
