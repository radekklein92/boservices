"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";

// Stažení master exportu Real Estate (.xlsx) ze serveru
// (/api/portal/real-estate-export): tabulka ve formátu NewCo importu + všechna
// systémová data. Sdílené tlačítko - používá ho toolbar Real Estate tabulky
// i hlavička stránky Lokality. Vzhled řídí `className` (každé místo má svůj styl).
export function ReExcelExportButton({
  className,
  label = "Excel",
  iconSize = "h-3.5 w-3.5",
}: {
  className: string;
  label?: string;
  iconSize?: string;
}) {
  const [exporting, setExporting] = useState(false);

  async function run() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/portal/real-estate-export", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (ASCII)
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `real-estate-${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[real-estate] XLSX export selhal", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={exporting}
      title="Stáhne kompletní tabulku NewCo lokalit (formát NewCo importu + všechna data ze systému) do Excelu (.xlsx)"
      className={className}
    >
      {exporting ? (
        <Loader2 className={`${iconSize} animate-spin`} strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <FileSpreadsheet className={iconSize} strokeWidth={1.5} aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
