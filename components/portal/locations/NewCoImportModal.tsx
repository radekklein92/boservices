"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  NEWCO_FIELDS,
  type NewCoMapping,
  type NewCoFieldKey,
  type XlsxColumn,
} from "@/lib/portal/newco-fields";
import { BTN_PRIMARY } from "@/components/portal/ui/buttons";

type ParseData = {
  sheetName: string;
  columns: XlsxColumn[];
  rows: Array<Record<string, string>>;
  rowRedCounts: number[];
  rowCount: number;
};

type Summary = {
  total: number;
  matched: number;
  flaggedRed: number;
  noCode: number;
  unmatchedCount: number;
  unmatched: string[];
};

export function NewCoImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [phase, setPhase] = useState<"pick" | "mapping" | "done">("pick");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ParseData | null>(null);
  const [mapping, setMapping] = useState<NewCoMapping | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/portal/locations/newco/parse", {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "Soubor se nepodařilo načíst.");
      setData({
        sheetName: d.sheetName,
        columns: d.columns,
        rows: d.rows,
        rowRedCounts: d.rowRedCounts,
        rowCount: d.rowCount,
      });
      setMapping(d.suggestedMapping);
      setPhase("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
    } finally {
      setPending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function doImport() {
    if (!data || !mapping) return;
    if (!mapping.code) {
      setError("Vyberte sloupec s kódem lokality (slouží k párování).");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/locations/newco/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping,
          rows: data.rows,
          rowRedCounts: data.rowRedCounts,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "Import selhal.");
      setSummary(d);
      setPhase("done");
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
    } finally {
      setPending(false);
    }
  }

  function setField(key: NewCoFieldKey | "code", letter: string) {
    setMapping((m) => (m ? { ...m, [key]: letter } : m));
  }

  const columnLabel = (c: XlsxColumn) =>
    c.label ? `${c.label} · ${c.letter}` : `Sloupec ${c.letter} (bez názvu)`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-8 backdrop-blur-sm md:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[600px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_24px_60px_-20px_rgba(14,14,14,0.35)] md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              Lokality
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Import NewCo z XLSX
            </h2>
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span>{error}</span>
          </div>
        )}

        {/* Krok 1: výběr souboru */}
        {phase === "pick" && (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] leading-relaxed text-ink-mid">
              Nahrajte XLSX se seznamem lokalit. Data se napárují k lokalitám podle
              kódu a uloží se k jejich detailu. V dalším kroku zkontrolujete mapování
              sloupců.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-edge bg-paper-warm px-6 py-10 text-center transition-colors hover:border-ink-soft disabled:opacity-60"
            >
              <FileSpreadsheet className="h-7 w-7 text-ink-mid" strokeWidth={1.25} aria-hidden="true" />
              <span className="text-[13.5px] font-semibold text-ink-base">
                {pending ? "Načítám…" : "Vybrat soubor XLSX"}
              </span>
              <span className="text-[11.5px] text-ink-mid">.xlsx · max 15 MB</span>
            </button>
          </div>
        )}

        {/* Krok 2: editor mapování */}
        {phase === "mapping" && data && mapping && (
          <div className="flex flex-col gap-4">
            <p className="text-[12.5px] text-ink-mid">
              List <strong className="text-ink-deep">{data.sheetName}</strong> ·{" "}
              {data.rowCount} řádků. Zkontrolujte, který sloupec odpovídá kterému poli
              (názvy i pořadí se mohou měnit).
            </p>

            <MapRow
              label="Kód lokality (párování)"
              required
              value={mapping.code}
              columns={data.columns}
              columnLabel={columnLabel}
              onChange={(v) => setField("code", v)}
            />

            <div className="h-px bg-edge" />

            {NEWCO_FIELDS.map((f) => (
              <MapRow
                key={f.key}
                label={f.label}
                value={mapping[f.key]}
                columns={data.columns}
                columnLabel={columnLabel}
                onChange={(v) => setField(f.key, v)}
              />
            ))}

            <p className="text-[11.5px] text-ink-soft">
              Řádky označené ve výchozím souboru červeně (≥ 5 buněk) se uloží jako
              „Označeno červeně" automaticky.
            </p>

            <div className="mt-1 flex items-center justify-end gap-2 border-t border-edge pt-4">
              <button
                type="button"
                onClick={() => {
                  setPhase("pick");
                  setData(null);
                  setMapping(null);
                  setError(null);
                }}
                className="h-10 rounded-full px-4 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base"
              >
                Zpět
              </button>
              <button
                type="button"
                onClick={doImport}
                disabled={pending}
                className={BTN_PRIMARY}
              >
                <Upload className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                {pending ? "Importuji…" : "Importovat"}
              </button>
            </div>
          </div>
        )}

        {/* Krok 3: souhrn */}
        {phase === "done" && summary && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span>
                Hotovo · napárováno {summary.matched} z {summary.total} řádků
                {summary.flaggedRed > 0 ? ` · ${summary.flaggedRed} označeno červeně` : ""}.
              </span>
            </div>
            {(summary.unmatchedCount > 0 || summary.noCode > 0) && (
              <div className="rounded-xl border border-edge bg-paper-warm px-4 py-3 text-[12px] text-ink-mid">
                {summary.unmatchedCount > 0 && (
                  <p>
                    Nenapárováno {summary.unmatchedCount} (kód neodpovídá žádné lokalitě)
                    {summary.unmatched.length > 0 && (
                      <>
                        :{" "}
                        <span className="font-mono text-ink-deep">
                          {summary.unmatched.join(", ")}
                          {summary.unmatchedCount > summary.unmatched.length ? " …" : ""}
                        </span>
                      </>
                    )}
                    .
                  </p>
                )}
                {summary.noCode > 0 && (
                  <p className="mt-1">{summary.noCode} řádků bez kódu přeskočeno.</p>
                )}
              </div>
            )}
            <div className="flex items-center justify-end border-t border-edge pt-4">
              <button type="button" onClick={onClose} className={BTN_PRIMARY}>
                Hotovo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MapRow({
  label,
  required,
  value,
  columns,
  columnLabel,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  columns: XlsxColumn[];
  columnLabel: (c: XlsxColumn) => string;
  onChange: (letter: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-[12.5px] font-medium text-ink-deep">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-edge bg-paper px-2.5 text-[12.5px] text-ink-base outline-none transition-colors focus:border-ink-base sm:w-[300px]"
      >
        {!required && <option value="">— nevybráno —</option>}
        {columns.map((c) => (
          <option key={c.letter} value={c.letter}>
            {columnLabel(c)}
          </option>
        ))}
      </select>
    </div>
  );
}
