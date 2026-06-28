import "server-only";
// FX přepočet měn pro POS dashboard. Kurzy z ČNB (denní kurz devizového trhu),
// báze CZK. Cachované (posStaticQuery - dlouhý TTL, nezávisle na razítku DW syncu)
// s hardcoded fallbackem, aby dashboard nikdy nespadl kvůli výpadku ČNB.
//
// Kontrakt: czkPerUnit[CODE] = kolik CZK stojí 1 jednotka měny CODE (CZK = 1).
//   convert(value, from, to) = value * czkPerUnit[from] / czkPerUnit[to]
import { posStaticQuery } from "./cache";

export type FxRates = {
  czkPerUnit: Record<string, number>;
  date: string | null; // datum kurzu z hlavičky ČNB; null u fallbacku
  fallback: boolean; // true = ČNB nedostupná, použity záložní kurzy
};

// Záložní kurzy (přibližné, báze CZK) - jen když je ČNB nedostupná. Lepší
// přibližný přepočet než rozbitý dashboard. Aktualizovat ručně při větším pohybu.
const FALLBACK_CZK_PER_UNIT: Record<string, number> = {
  CZK: 1,
  EUR: 25.1,
  PLN: 5.85,
  USD: 21.5,
  GBP: 29.5,
};

const CNB_URL =
  "https://www.cnb.cz/en/financial-markets/foreign-exchange-market/central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt";

// Parse ČNB daily.txt:
//   řádek 1: "28 Jun 2026 #123"
//   řádek 2: "Country|Currency|Amount|Code|Rate"
//   dále:    "EMU|euro|1|EUR|25.115"
function parseCnb(txt: string): FxRates {
  const lines = txt.trim().split(/\r?\n/);
  const date = lines[0]?.split("#")[0]?.trim() || null;
  const czkPerUnit: Record<string, number> = { CZK: 1 };
  for (let i = 2; i < lines.length; i++) {
    const parts = lines[i].split("|");
    if (parts.length < 5) continue;
    const amount = parseFloat(parts[2].replace(",", "."));
    const code = parts[3].trim().toUpperCase();
    const rate = parseFloat(parts[4].replace(",", "."));
    if (!code || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0) continue;
    czkPerUnit[code] = rate / amount;
  }
  return { czkPerUnit, date, fallback: false };
}

async function fetchCnbRates(): Promise<FxRates> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(CNB_URL, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`ČNB ${res.status}`);
    const parsed = parseCnb(await res.text());
    // Sanity: kurz EUR musí dávat smysl (cca 22-30 CZK), jinak parser/feed selhal.
    const eur = parsed.czkPerUnit.EUR;
    if (!eur || eur < 10 || eur > 50) throw new Error("ČNB kurz mimo očekávaný rozsah");
    return parsed;
  } catch (e) {
    console.error("[pos/fx] ČNB kurz nedostupný, fallback:", e instanceof Error ? e.message : e);
    return { czkPerUnit: { ...FALLBACK_CZK_PER_UNIT }, date: null, fallback: true };
  }
}

// Cache ~6 h (ČNB publikuje 1x denně v pracovní dny ~14:30). posStaticQuery =
// nezávisle na razítku DW syncu, sdílené serverové memo pro všechny uživatele.
const _fxRates = posStaticQuery(() => fetchCnbRates(), "fx-cnb", 6 * 3600);
export function getFxRates(): Promise<FxRates> {
  return _fxRates();
}

// Faktor pro převod 1 jednotky `from` na `to`. Neznámá měna -> 1 (raději nepřeváděj
// než přeházej řády); v praxi jsou všechny měny POS (CZK/EUR/PLN) v ČNB.
export function fxFactor(from: string, to: string, rates: FxRates): number {
  if (from === to) return 1;
  const f = rates.czkPerUnit[from];
  const t = rates.czkPerUnit[to];
  if (!f || !t) return 1;
  return f / t;
}

export function convertMoney(value: number, from: string, to: string, rates: FxRates): number {
  return value * fxFactor(from, to, rates);
}

// Lze měnu převést? = má v kurzovním lístku kurz (CZK má 1). Pozor: DW agreguje
// fakta přes VŠECHNY měny včetně AED (testovací pobočka, není v ČNB) - takové
// řádky se z přepočtu/agregace VYNECHAJÍ, ať nekontaminují součet nominálem.
export function hasRate(currency: string, rates: FxRates): boolean {
  return rates.czkPerUnit[currency] != null;
}

// Převede vybraná peněžní pole řádku z row.currency na `to` a přepíše currency.
// Nepeněžní pole (počty, qty) zůstanou. Vrací mělkou kopii (originál se nemění).
// Pozn.: u neznámé měny (factor 1, from!==to) řádek NEpřeznačí - nechá nativní
// měnu, ať se cizí hodnota nezobrazí mylně v cílové měně.
export function convertRow<T extends { currency: string }>(
  row: T,
  to: string,
  rates: FxRates,
  moneyKeys: readonly (keyof T)[],
): T {
  if (row.currency === to) return row;
  const factor = fxFactor(row.currency, to, rates);
  if (factor === 1) return row; // neznámá měna -> nepřeváděj ani nepřeznačuj
  const out: T = { ...row };
  for (const k of moneyKeys) {
    const v = out[k];
    if (typeof v === "number") (out[k] as unknown as number) = v * factor;
  }
  (out as { currency: string }).currency = to;
  return out;
}

// Převede celé pole řádků na cílovou měnu. Řádky v nepřevoditelné měně (bez kurzu,
// typicky AED) VYNECHÁ - jinak by se přičetly v nominále jako cílová měna.
export function convertRows<T extends { currency: string }>(
  rows: T[],
  to: string,
  rates: FxRates,
  moneyKeys: readonly (keyof T)[],
): T[] {
  return rows.filter((r) => hasRate(r.currency, rates)).map((r) => convertRow(r, to, rates, moneyKeys));
}
