// Klientsky-bezpečné pomocné funkce a labely pro POS UI (formátování peněz/čísel,
// procentní změny, denní doby). Žádný server-only import.
import type { Daypart } from "@/lib/portal/pos/types";

// Multi-měnové formátování (CZK/EUR/PLN/AED...). FX se nepřepočítává - každá
// hodnota se zobrazí ve své měně.
export function formatPosMoney(
  value: number,
  currency: string,
  maximumFractionDigits = 0,
): string {
  try {
    return new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency,
      maximumFractionDigits,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits }).format(value)} ${currency}`;
  }
}

export function formatPosNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits }).format(value);
}

// Kompaktní peníze pro headline KPI ("6,94 mil. Kč") - nikdy nepřeteče kartu.
// Pod ~100 tis. zobrazí plnou částku (kompakt by tam byl nečitelný).
export function formatPosMoneyCompact(value: number, currency: string): string {
  if (Math.abs(value) < 100_000) return formatPosMoney(value, currency);
  try {
    return new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 2 : 0,
    }).format(value);
  } catch {
    return formatPosMoney(value, currency);
  }
}

export function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)} %`;
}

// Procentní změna current vs previous. null = nelze spočítat (chybí/0 základ).
export function pctChange(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export const DAYPART_LABEL: Record<Daypart, string> = {
  rano: "Ráno",
  dopoledne: "Dopoledne",
  poledne: "Poledne",
  odpoledne: "Odpoledne",
  vecer: "Večer",
  noc: "Noc",
};

export const DOW_LABEL = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

// "2026-06-27 18:49:12" (shop-local, naivní) -> "27.6. 18:49". NEparsovat přes
// Date (vyhnout se TZ reinterpretaci) - jen rozdělit string.
export function formatLocalDateTime(s: string): string {
  const [datePart, timePart] = s.split(/[ T]/);
  if (!datePart) return s;
  const [, m, d] = datePart.split("-");
  const hm = timePart ? timePart.slice(0, 5) : "";
  return `${Number(d)}.${Number(m)}.${hm ? ` ${hm}` : ""}`;
}
