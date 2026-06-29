// Strukturované poplatky vytažené ze smlouvy (AI nebo ručně). „Kolik a od kdy/do
// kdy se za lokalitu fakturuje." Příprava pod budoucí automatické vystavování faktur.
//
// Pure modul (žádný Redis) - bezpečně importovatelný i v client komponentě.
// Reálné období se počítá deterministicky v kódu (resolveRelativePeriods), AI
// vrací relativní měsíce; absolutní data dopočítáme z data podpisu klienta.

import type { Contract } from "./contracts-db";
import { isApprovalGated } from "./contract-types";
import { formatKc } from "./contract-fees";

// Druh poplatku. Procento z obratu (franšíza/marketing) nebo fixní částka
// (provozování/spolupráce). „other" = cokoli, co nesedí do škatulek.
export type FeeKind =
  | "franchise"
  | "marketing"
  | "operation"
  | "cooperation"
  | "other";

// Perioda fixní částky. „none" = poplatek je procentuální (částka se neuplatní).
export type AmountPeriod = "monthly" | "yearly" | "one-time" | "none";

export type AiConfidence = "high" | "medium" | "low" | "none";

// Původ údaje: čistá AI extrakce / ruční zápis / AI s ručními úpravami.
// Re-extrakce přepíše jen „ai" (ruční korekce se nezahodí bez force).
export type FeeSource = "ai" | "manual" | "ai-edited";

// Jedna souvislá poplatková perioda (sazba platná v daném časovém okně).
// Zaváděcí snížený poplatek a navazující standardní poplatek jsou dvě periody.
export interface FeePeriod {
  id: string;
  label: string;
  kind: FeeKind;
  // Procentuální sazba (např. 8 pro 8 %); 0 když je poplatek fixní částkou.
  percent: number;
  // Z čeho se procento počítá (např. „měsíční obrat bez DPH"); "" když fixní.
  percentBase: string;
  // Fixní částka bez DPH (Kč); 0 když je poplatek procentuální.
  amount: number;
  amountPeriod: AmountPeriod;
  // Absolutní hranice (ISO YYYY-MM-DD). "" = od účinnosti / dopočítá se z relativních.
  from: string;
  // "" = bez konce (trvale).
  to: string;
  // Relativní hranice „od účinnosti": 0 = od účinnosti, jinak N. měsíc. Model je
  // vyplní u formulací typu „prvních N měsíců"; resolveRelativePeriods je převede
  // na absolutní from/to vůči datu účinnosti.
  relativeFromMonth: number;
  relativeToMonth: number;
  note: string;
}

// Poplatky jedné smlouvy. Žije na Contract.feeTerms.
export interface ContractFeeTerms {
  // Účinnost smlouvy (ISO); "" = dnem podpisu (kotva = clientSignedAt).
  effectiveFrom: string;
  // Odložená fakturace (ISO); "" = shodné s účinností (žádný odklad).
  invoicingStartsFrom: string;
  // Datum konce smlouvy (ISO). Franšíza je na dobu určitou (např. 10 let od podpisu)
  // -> konkrétní datum; dopočítá se z termMonths při extrakci. "" = na dobu neurčitou
  // (spolupráce/provozování) - jejich konec se odvozuje od franšízy lokality při zobrazení.
  termEndsAt: string;
  currency: string;
  periods: FeePeriod[];
  summary: string;
  source: FeeSource;
  aiModel: string;
  aiConfidence: AiConfidence;
  aiNotes: string;
  extractedAt: string;
  updatedBy: string;
  updatedAt: string;
}

export const FEE_KIND_LABEL: Record<FeeKind, string> = {
  franchise: "Franšízový poplatek",
  marketing: "Marketingový poplatek",
  operation: "Odměna za provozování",
  cooperation: "Odměna za spolupráci",
  other: "Jiný poplatek",
};

export const AMOUNT_PERIOD_LABEL: Record<AmountPeriod, string> = {
  monthly: "měsíčně",
  yearly: "ročně",
  "one-time": "jednorázově",
  none: "",
};

const AMOUNT_PERIOD_SUFFIX: Record<AmountPeriod, string> = {
  monthly: "/měs",
  yearly: "/rok",
  "one-time": " jednorázově",
  none: "",
};

// Smlouva, ze které vůbec vytahujeme poplatky: approval-gated typ (franšíza,
// spolupráce, provozování), podepsaná klientem, nezrušená. Sdílený predikát pro
// triggery, cron i UI.
export function shouldExtractFeeTerms(
  c: Pick<Contract, "type" | "clientSignedAt" | "digisignClientSignedAt" | "cancelledAt">,
): boolean {
  // „Podepsáno klientem (efektivně)" = i DigiSign mezistav (digisignClientSignedAt).
  // Shodně s tím, jak se poplatky zobrazují (clientSignedAtEffective v buildFeeRows/
  // ClientFeeSummary), aby franšíza podepsaná jen přes DigiSign nezůstala viset v
  // „zpracovává se" (cron ji jinak nikdy nevezme). Efektivní datum je i kotvou period.
  return (
    isApprovalGated(c.type) &&
    !!(c.clientSignedAt ?? c.digisignClientSignedAt) &&
    !c.cancelledAt
  );
}

// Přičte n měsíců k ISO datu (YYYY-MM-DD), s clampem na konec cílového měsíce
// (31.1. + 1 měsíc = 28./29.2., ne přetečení do března).
function addMonthsISO(iso: string, n: number): string {
  const base = iso.slice(0, 10);
  const [y, m, d] = base.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return "";
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const daysInTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const day = Math.min(d, daysInTarget);
  const yy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Dopočítá absolutní from/to z relativních měsíců vůči datu účinnosti. Kotva =
// effectiveFrom (odložená účinnost má přednost), jinak datum podpisu klienta.
// Volá se po AI extrakci i po editaci, ať feeTermsForDate pracuje jen s absolutními daty.
export function resolveRelativePeriods(
  terms: ContractFeeTerms,
  effectiveISO: string,
): ContractFeeTerms {
  const base = (terms.effectiveFrom || effectiveISO || "").slice(0, 10);
  const end = (terms.termEndsAt || "").slice(0, 10);
  const resolved = terms.periods.map((p) => {
    const from =
      p.from ||
      (base
        ? p.relativeFromMonth > 0
          ? addMonthsISO(base, p.relativeFromMonth)
          : base
        : "");
    let to =
      p.to ||
      (base && p.relativeToMonth > 0 ? addMonthsISO(base, p.relativeToMonth) : "");
    // Perioda bez vlastního konce -> konec smlouvy (u franšízy termEndsAt).
    // Spolupráce/provozování mají termEndsAt="" -> konec zůstane prázdný a
    // doplní se až při zobrazení z franšízy lokality (displayPeriodEnd).
    if (!to && end) to = end;
    return { ...p, from, to };
  });
  // Navazující sazba začíná DEN PO konci předchozí (ne ve stejný den) - bez překryvu.
  // Periody jdou chronologicky (zaváděcí -> standardní).
  for (let i = 1; i < resolved.length; i++) {
    const prev = resolved[i - 1]!;
    const cur = resolved[i]!;
    if (cur.from && prev.to && cur.from.slice(0, 10) <= prev.to.slice(0, 10)) {
      cur.from = addDaysISO(prev.to, 1);
    }
  }
  return { ...terms, periods: resolved };
}

// Přičte n dní k ISO datu (YYYY-MM-DD).
function addDaysISO(iso: string, n: number): string {
  const base = iso.slice(0, 10);
  const [y, m, d] = base.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return base;
  const t = new Date(Date.UTC(y, m - 1, d + n));
  const yy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Konec smlouvy dopočtený z doby trvání (termMonths) vůči kotvě (účinnost / podpis).
// termMonths <= 0 -> "" (na dobu neurčitou).
export function computeTermEndsAt(anchorISO: string, termMonths: number): string {
  if (!termMonths || termMonths <= 0) return "";
  return addMonthsISO(anchorISO, termMonths);
}

// Efektivní konec periody pro zobrazení: vlastní konec periody, jinak (u smluv
// vázaných na franšízu) konec franšízy lokality. "" = bez konce / dle franšízy.
export function displayPeriodEnd(p: FeePeriod, franchiseEndISO: string): string {
  return p.to || franchiseEndISO || "";
}

export interface FeeTermsAtDate {
  active: FeePeriod[];
  billable: boolean;
  effectiveYet: boolean;
  label: string;
}

// Která perioda je k danému datu aktivní + lidský souhrn „kolik fakturovat".
// Respektuje effectiveFrom (účinnost) i invoicingStartsFrom (odložená fakturace).
export function feeTermsForDate(
  terms: ContractFeeTerms,
  dateISO: string,
): FeeTermsAtDate {
  const d = dateISO.slice(0, 10);
  const eff = (terms.effectiveFrom || "").slice(0, 10);
  const effectiveYet = !eff || d >= eff;
  const invFrom = (terms.invoicingStartsFrom || eff || "").slice(0, 10);
  const billable = effectiveYet && (!invFrom || d >= invFrom);
  const active = terms.periods.filter((p) => {
    const fromOk = !p.from || d >= p.from.slice(0, 10);
    const toOk = !p.to || d <= p.to.slice(0, 10);
    return fromOk && toOk;
  });
  return { active, billable, effectiveYet, label: labelForPeriods(active, terms.currency) };
}

// Naformátuje sazbu jedné periody na čisté „8 %" nebo „30 000 Kč/měs".
// Základ procenta (percentBase) se ZÁMĚRNĚ nezobrazuje (je zřejmé, že z obratu).
export function formatFeePeriod(p: FeePeriod, currency: string): string {
  if (p.percent > 0) {
    return `${formatNum(p.percent)} %`;
  }
  if (p.amount > 0) {
    const cur = currency || "CZK";
    const amount = cur === "CZK" ? formatKc(String(p.amount)) : `${formatNum(p.amount)} ${cur}`;
    return `${amount}${AMOUNT_PERIOD_SUFFIX[p.amountPeriod]}`;
  }
  return "neuvedeno";
}

function labelForPeriods(periods: FeePeriod[], currency: string): string {
  if (periods.length === 0) return "—";
  return periods.map((p) => formatFeePeriod(p, currency)).join(" + ");
}

// Krátký souhrn poplatků smlouvy pro chip/řádek (agregace u klienta). Primárně
// věta od AI (summary), jinak složeno ze všech period.
export function summarizeContractFee(
  terms: ContractFeeTerms | null | undefined,
): string {
  if (!terms || terms.periods.length === 0) return "Poplatek neuveden";
  if (terms.summary.trim()) return terms.summary.trim();
  return labelForPeriods(terms.periods, terms.currency);
}

// Číslo bez zbytečných desetin (8 -> „8", 2.5 -> „2,5") s českou čárkou.
function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}
