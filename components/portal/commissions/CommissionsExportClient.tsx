"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { FilterChip } from "@/components/portal/ui/FilterChip";
import { PAYOUT_STATUS_LABEL, type PayoutStatus } from "@/lib/portal/payouts-db";

// Pořadí stavů ve filtru = pořadí flow (podklad → uhrazeno).
const STATUS_ORDER: PayoutStatus[] = [
  "podklad",
  "fakturovano",
  "zadano-k-uhrade",
  "uhrazeno",
];

// Export podkladu pro účetní (XLSX). Filtr na stav výběru + období (dle data
// podkladu); prázdný filtr = všechno. Stahuje přes fetch+blob kvůli ošetření
// chyb a názvu souboru z hlavičky. Jen pro adminy (renderuje se podmíněně).
export function CommissionsExportClient() {
  const [statuses, setStatuses] = useState<Set<PayoutStatus>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(s: PayoutStatus) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statuses.size) params.set("statuses", [...statuses].join(","));
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const res = await fetch(
        `/api/portal/commissions/export${qs ? `?${qs}` : ""}`,
      );
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "K exportu nemáš oprávnění."
            : "Export se nepodařilo vygenerovat.",
        );
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("X-Filename") ?? "provize-uctarna.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export se nepodařilo vygenerovat.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
          Export pro účetní
        </h2>
        <span className="hidden text-[12px] text-ink-mid md:inline">
          · XLSX: výběry provizí (doklady) + souhrn provizí
        </span>
      </div>

      <div className="rounded-[24px] border border-edge bg-paper p-5 md:p-7">
        <div className="flex flex-col gap-5">
          {/* Filtr stavu */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
              Stav výběru
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_ORDER.map((s) => (
                <FilterChip
                  key={s}
                  active={statuses.has(s)}
                  onClick={() => toggle(s)}
                  label={PAYOUT_STATUS_LABEL[s]}
                />
              ))}
              <span className="text-[12px] text-ink-soft">
                {statuses.size === 0 ? "vše" : `${statuses.size} vybráno`}
              </span>
            </div>
          </div>

          {/* Období dle data podkladu */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
              Období (datum podkladu)
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[12.5px] text-ink-deep">
                Od
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9 rounded-lg border border-edge bg-paper px-3 text-[13px] text-ink-deep outline-none focus:border-ink-soft"
                />
              </label>
              <label className="flex items-center gap-2 text-[12.5px] text-ink-deep">
                Do
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 rounded-lg border border-edge bg-paper px-3 text-[13px] text-ink-deep outline-none focus:border-ink-soft"
                />
              </label>
              {(from || to) && (
                <button
                  type="button"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                  className="text-[12px] text-ink-soft underline-offset-2 hover:text-ink-mid hover:underline"
                >
                  vymazat
                </button>
              )}
            </div>
          </div>

          {/* Akce */}
          <div className="flex flex-wrap items-center gap-4 border-t border-edge pt-5">
            <button
              type="button"
              onClick={download}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              )}
              Stáhnout XLSX
            </button>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft">
              <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              otevře Excel, Google Sheets i účetní software
            </span>
            {error && (
              <span className="text-[12.5px] font-medium text-red-600">{error}</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
