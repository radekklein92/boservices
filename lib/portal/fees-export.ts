import { buildXlsx, type XlsxColumn, type CellValue } from "./xlsx-writer";
import { fmtDate } from "./export-format";
import type { FeeRow, MonthFeeStatus } from "./fees-page";

// Klientský XLSX export stránky Poplatky: vezme řádky poplatků za zvolený měsíc
// (už odfiltrované tím, co je na stránce vidět) a vyexportuje je do jednoho
// listu. Staví se na klientovi přes izomorfní buildXlsx (stejně jako Klienti /
// Smlouvy). "Částka" je číselná buňka (Excel ji umí sečíst); "Sazba" zůstává
// textová (procento i fixní paušál v jednom sloupci, jako v tabulce).

// Zrcadlí FeeRowView z FeesClient (client komponenta) - držíme lib bez importu
// z "use client" modulu; struktura musí zůstat v sync.
type FeeRowView = FeeRow & {
  status: MonthFeeStatus;
  computedAmount: number | null;
  computedCurrency: string;
  billedDays?: number;
  billedFrom?: string;
  billedTo?: string;
};

const STATUS_LABEL: Record<MonthFeeStatus, string> = {
  final: "Finální",
  estimate: "Odhad",
  none: "",
};

const COLUMNS: XlsxColumn[] = [
  { header: "Lokalita", width: 30 },
  { header: "Klient", width: 28 },
  { header: "Smlouva", width: 22 },
  { header: "Poplatek", width: 34 },
  { header: "Sazba", width: 18 },
  { header: "Částka", width: 14 },
  { header: "Měna", width: 8 },
  { header: "Status", width: 12 },
  { header: "Od", width: 14 },
  { header: "Do", width: 22 },
  { header: "Započteno dnů", width: 14 },
];

function feeRow(r: FeeRowView): CellValue[] {
  const amount =
    !r.pending && r.status !== "none" && r.computedAmount != null
      ? Math.round(r.computedAmount)
      : null;
  // Do: prázdné datum u účinné smlouvy = "dle franšízové smlouvy" (jako v tabulce),
  // u pending řádku (čeká na extrakci) necháme prázdné.
  const toLabel = r.pending ? "" : r.to ? fmtDate(r.to) : "dle franšízové smlouvy";
  return [
    r.locationName,
    r.clientName,
    r.contractLabel,
    r.pending ? r.pending : r.periodLabel,
    r.rate,
    amount,
    amount != null ? r.computedCurrency : "",
    STATUS_LABEL[r.status],
    fmtDate(r.from),
    toLabel,
    !r.pending && r.status !== "none" ? (r.billedDays ?? null) : null,
  ];
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  if (!y || !m) return key;
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildFeesXlsx(rows: FeeRowView[], month: string): Promise<Uint8Array> {
  const data = rows.map(feeRow);
  return buildXlsx([{ name: `Poplatky ${monthLabel(month)}`, columns: COLUMNS, rows: data }]);
}
