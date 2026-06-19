// Podklad pro účetní = XLSX se dvěma listy:
//   1) "Payouty" - jednotlivé výběry provize jako účetní doklady (dodavatel,
//      IČO/DIČ, variabilní symbol, základ/DPH/celkem, odběratel, předmět). Dole
//      kontrolní součtový řádek. Respektuje filtr (stav + období dle createdAt).
//   2) "Souhrn provizí" - aktuální nárok per obchodník (ze smluv, z pohledávek,
//      celkem, vybráno, k dispozici) + řádek Celkem. Počítá se z VŠECH payoutů,
//      ne z filtrovaných - je to celkový stav, ne výřez za období.
//
// DPH se počítá shodně s podkladem PDF (lib/portal/payout-pdf.ts): základ =
// zaokrouhlený amount, 21 % jen u plátce. Předmět plnění záměrně bez zmínky o
// postoupení pohledávek (konzistentně s podkladem - viz commit 81dc39c).

import type { Payout, PayoutStatus } from "./payouts-db";
import {
  PAYOUT_STATUS_LABEL,
  salespersonAvailable,
  sumPayouts,
} from "./payouts-db";
import type { CommissionsView } from "./commissions";
import type { XlsxSheet } from "./xlsx-writer";

// Předmět plnění na dokladu - bez zmínky o pohledávkách (jako podklad PDF).
export const COMMISSION_SUBJECT = "Provize za zprostředkování";

const VAT_RATE = 0.21;

export interface ExportFilter {
  statuses?: PayoutStatus[]; // prázdné/undefined = všechny stavy
  from?: string; // YYYY-MM-DD včetně (dle dne vytvoření payoutu)
  to?: string; // YYYY-MM-DD včetně
}

// DPH rozpad jednoho payoutu - shodně s podkladem PDF.
export interface PayoutAmounts {
  base: number; // základ (bez DPH)
  vatRate: number; // 21 nebo 0
  vat: number;
  total: number; // k úhradě
}

export function payoutAmounts(p: Payout): PayoutAmounts {
  const base = Math.round(p.amount);
  const isVat = p.billing.isVatPayer;
  const vat = isVat ? Math.round(p.amount * VAT_RATE) : 0;
  return { base, vatRate: isVat ? 21 : 0, vat, total: base + vat };
}

// Filtr dle stavu + období (den vytvoření). ISO datum jde porovnávat jako string.
export function filterPayouts(
  payouts: Payout[],
  filter: ExportFilter,
): Payout[] {
  const statuses =
    filter.statuses && filter.statuses.length
      ? new Set(filter.statuses)
      : null;
  return payouts.filter((p) => {
    if (statuses && !statuses.has(p.status)) return false;
    const day = (p.createdAt ?? "").slice(0, 10);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    return true;
  });
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// List "Payouty" - jeden řádek = jeden doklad, dole kontrolní součet.
function buildPayoutsSheet(payouts: Payout[]): XlsxSheet {
  const columns = [
    { header: "Variabilní symbol", width: 16 },
    { header: "Datum podkladu", width: 14 },
    { header: "Obchodník", width: 14 },
    { header: "Stav", width: 16 },
    { header: "Dodavatel", width: 30 },
    { header: "IČO dodavatele", width: 14 },
    { header: "DIČ dodavatele", width: 14 },
    { header: "Plátce DPH", width: 11 },
    { header: "Základ bez DPH", width: 15 },
    { header: "Sazba DPH %", width: 12 },
    { header: "DPH", width: 13 },
    { header: "Celkem k úhradě", width: 15 },
    { header: "Číslo účtu", width: 22 },
    { header: "Odběratel", width: 32 },
    { header: "IČO odběratele", width: 14 },
    { header: "Datum úhrady", width: 14 },
    { header: "Předmět plnění", width: 28 },
  ];

  const rows = payouts.map((p) => {
    const a = payoutAmounts(p);
    return [
      p.variableSymbol,
      fmtDate(p.createdAt),
      p.merchantName,
      PAYOUT_STATUS_LABEL[p.status],
      p.billing.name,
      p.billing.ico ?? "",
      p.billing.dic ?? "",
      p.billing.isVatPayer ? "Ano" : "Ne",
      a.base,
      a.vatRate,
      a.vat,
      a.total,
      p.billing.bankAccount ?? "",
      p.customer.name,
      p.customer.ico ?? "",
      fmtDate(p.paidAt),
      COMMISSION_SUBJECT,
    ];
  });

  // Kontrolní součtový řádek (jen u peněžních sloupců).
  if (payouts.length) {
    const totals = payouts.reduce(
      (acc, p) => {
        const a = payoutAmounts(p);
        acc.base += a.base;
        acc.vat += a.vat;
        acc.total += a.total;
        return acc;
      },
      { base: 0, vat: 0, total: 0 },
    );
    rows.push([
      "Celkem",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      totals.base,
      "",
      totals.vat,
      totals.total,
      "",
      "",
      "",
      "",
      "",
    ]);
  }

  return { name: "Payouty", columns, rows };
}

// List "Souhrn provizí" - aktuální nárok per obchodník + řádek Celkem.
function buildSummarySheet(
  view: CommissionsView,
  allPayouts: Payout[],
): XlsxSheet {
  const columns = [
    { header: "Obchodník", width: 16 },
    { header: "Provize ze smluv", width: 17 },
    { header: "Provize z pohledávek", width: 19 },
    { header: "Provize celkem", width: 16 },
    { header: "Vybráno", width: 14 },
    { header: "K dispozici", width: 14 },
  ];

  const sum = { contracts: 0, claim: 0, total: 0, paid: 0, avail: 0 };
  const rows = view.bySalesperson.map((s) => {
    const theirs = allPayouts.filter((p) => p.salespersonId === s.id);
    const paid = sumPayouts(theirs);
    const avail = salespersonAvailable(s.total, theirs);
    sum.contracts += s.contractsCommission;
    sum.claim += s.claimCommission;
    sum.total += s.total;
    sum.paid += paid;
    sum.avail += avail;
    return [
      s.name,
      Math.round(s.contractsCommission),
      Math.round(s.claimCommission),
      Math.round(s.total),
      Math.round(paid),
      Math.round(avail),
    ];
  });

  rows.push([
    "Celkem",
    Math.round(sum.contracts),
    Math.round(sum.claim),
    Math.round(sum.total),
    Math.round(sum.paid),
    Math.round(sum.avail),
  ]);

  return { name: "Souhrn provizí", columns, rows };
}

// Sestaví listy pro XLSX. payouts = už vyfiltrované (list Payouty),
// allPayouts = všechny (souhrn nároků/výběrů).
export function buildCommissionsExportSheets(
  payouts: Payout[],
  view: CommissionsView,
  allPayouts: Payout[],
): XlsxSheet[] {
  return [buildPayoutsSheet(payouts), buildSummarySheet(view, allPayouts)];
}
