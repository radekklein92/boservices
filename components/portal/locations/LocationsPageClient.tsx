"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamicImport from "next/dynamic";
import { RefreshCw, CheckCircle2, AlertTriangle, CircleDashed, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import type { LocationsSyncMeta, MirroredLocation } from "@/lib/portal/locations-db";
import { LocationsTable } from "./LocationsTable";
import { formatDateTime } from "./locations-shared";

const NewCoImportModal = dynamicImport(
  () => import("./NewCoImportModal").then((m) => m.NewCoImportModal),
  { ssr: false },
);

export function LocationsPageClient({
  locations,
  syncMeta,
  withContractIds,
}: {
  locations: MirroredLocation[];
  syncMeta: LocationsSyncMeta | null;
  // Id lokalit s nahranou přílohou (nájemní smlouvou) - pro filtr v tabulce.
  withContractIds: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function syncNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/locations/sync", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(
          data.reason === "not-configured"
            ? "Integrace s Transition není nastavená (chybí URL nebo token)."
            : data.error || "Synchronizace selhala.",
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Synchronizace selhala.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Franšízing"
        title="Lokality"
        lede="Read-only zrcadlo lokalit z projektu Transition. Spravují se výhradně v Transition; tady je vidíte i s kategorií a můžete k nim přidávat poznámky a přílohy."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-edge bg-paper px-5 text-[13.5px] font-semibold text-ink-base transition-colors hover:border-ink-base"
            >
              <FileSpreadsheet className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              Import NewCo
            </button>
            <button
              type="button"
              onClick={syncNow}
              disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-edge bg-paper px-5 text-[13.5px] font-semibold text-ink-base transition-colors hover:border-ink-base disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {busy ? "Synchronizuji…" : "Synchronizovat teď"}
            </button>
          </div>
        }
      />

      <SyncStatus meta={syncMeta} error={error} />

      <LocationsTable locations={locations} withContractIds={withContractIds} />

      {importOpen && (
        <NewCoImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => router.refresh()}
        />
      )}
    </div>
  );
}

function SyncStatus({
  meta,
  error,
}: {
  meta: LocationsSyncMeta | null;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-[13px] text-red-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
        <span>{error}</span>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-edge bg-paper-warm px-5 py-4 text-[13px] text-ink-mid">
        <CircleDashed className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
        <span>
          Zatím neproběhla žádná synchronizace. Po nastavení integrace
          s Transition (URL + token) a prvním běhu cronu se zde objeví stav.
        </span>
      </div>
    );
  }

  const Icon = meta.ok ? CheckCircle2 : AlertTriangle;
  const tone = meta.ok
    ? "border-edge bg-paper-warm text-ink-deep"
    : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-2xl border px-5 py-4 text-[12.5px] ${tone}`}>
      <span className="inline-flex items-center gap-2 font-medium">
        <Icon
          className={`h-4 w-4 shrink-0 ${meta.ok ? "text-emerald-600" : "text-amber-600"}`}
          strokeWidth={1.5}
        />
        {meta.ok ? "Synchronizováno" : "Poslední synchronizace selhala"}
      </span>
      <span className="text-ink-mid">{formatDateTime(meta.lastSyncAt)}</span>
      {meta.ok && (
        <>
          <span className="text-ink-mid">
            {meta.synced} lokalit
            {meta.removed > 0 ? ` · ${meta.removed} odebráno` : ""}
          </span>
        </>
      )}
      {!meta.ok && meta.error && <span className="text-amber-800">{meta.error}</span>}
    </div>
  );
}
