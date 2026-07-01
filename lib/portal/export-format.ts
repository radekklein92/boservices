// Formátování hodnot pro XLSX exporty (Klienti, Smlouvy). Exporty se sestavují
// na klientovi (v prohlížeči), takže cs-CZ lokalizace bere data z prohlížeče.

// ISO -> "1. 6. 2026" (jen datum). Prázdné/nevalidní -> "".
export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

// ISO -> "1. 6. 2026 14:30" (datum + čas). Pro časová razítka (podpisy apod.).
export function fmtDateTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
