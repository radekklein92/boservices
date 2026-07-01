"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { BTN_OUTLINE } from "@/components/portal/ui/buttons";

// Univerzální tlačítko pro stažení .xlsx sestaveného na klientovi (bez API
// route). `build` vrátí bajty (viz buildXlsx v lib/portal/xlsx-writer.ts, který
// je izomorfní a běží i v prohlížeči) - my z nich uděláme Blob a stáhneme.
// Vzhled je defaultně sekundární pilulka portálu (BTN_OUTLINE); lze přebít
// přes `className`. Download flow je stejný jako u ReExcelExportButton.
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function XlsxDownloadButton({
  build,
  filename,
  className = BTN_OUTLINE,
  label = "XLS",
  iconSize = "h-4 w-4",
  disabled = false,
  title,
}: {
  build: () => Promise<Uint8Array>;
  filename: string;
  className?: string;
  label?: string;
  iconSize?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const bytes = await build();
      // Kopie nad plain ArrayBuffer - jszip typuje výstup jako
      // Uint8Array<ArrayBufferLike>, což Blob jinak nemusí přijmout.
      const blob = new Blob([new Uint8Array(bytes)], { type: XLSX_MIME });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[xlsx] export selhal", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy || disabled}
      title={title ?? "Stáhnout do Excelu (.xlsx)"}
      className={className}
    >
      {busy ? (
        <Loader2 className={`${iconSize} animate-spin`} strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <FileSpreadsheet className={iconSize} strokeWidth={1.5} aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
