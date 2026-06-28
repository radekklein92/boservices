// Výkonové pojistky pro POS dotazy: omezují okno a stránkování tak, aby žádný
// dotaz nemohl utéct mimo limity API DW (a aby drahé raw-fact scany zůstaly malé).
import { inclusiveDays, type DateRange } from "./filters";

// Shoda s capem veřejného API (13 měsíců). Agregace nad MV.
export const MAX_WINDOW_DAYS = 396;
// Přísnější cap pro raw-fact cesty (heatmapa, daypart, účtenky) - drží scany levné.
export const MAX_RAW_WINDOW_DAYS = 90;
export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;
// Denní trend pro částečný výběr prodejen (ne celé značky) bez DW shop_ids: fanout
// po pokladnách. Nad tento strop se graf degraduje (KPI/žebříčky zůstávají přesné).
export const MAX_DAILY_SHOP_FANOUT = 12;

// Test/neprodejní pobočky (Trdlokafe "Test*/Testovací/VRP test") - vyřadit ze
// seznamů, žebříčků a scope. Mají ~nulové tržby, jen zašumují.
export function isTestShop(name: string): boolean {
  return /\btest|testov/i.test(name);
}

export function clampLimit(n: number | undefined, fallback = DEFAULT_LIMIT): number {
  if (!Number.isFinite(n as number)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(n as number)));
}

export function clampPage(n: number | undefined): number {
  if (!Number.isFinite(n as number)) return 0;
  return Math.max(0, Math.trunc(n as number));
}

// Ořízne okno na max počet dní (zachová `to`, posune `from` nahoru). Vrací i flag,
// jestli k ořezu došlo (UI pak může uživatele upozornit).
export function clampWindow(range: DateRange, maxDays = MAX_WINDOW_DAYS): { range: DateRange; clamped: boolean } {
  if (inclusiveDays(range) <= maxDays) return { range, clamped: false };
  const to = parseYmd(range.to);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (maxDays - 1));
  return { range: { from: from.toISOString().slice(0, 10), to: range.to }, clamped: true };
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
