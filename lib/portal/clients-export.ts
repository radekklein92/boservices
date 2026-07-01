import { buildXlsx, type XlsxColumn, type CellValue } from "./xlsx-writer";
import { fmtDate, fmtDateTime } from "./export-format";
import type { Client } from "./clients-db";

// Klientský XLSX export stránky Klienti: vezme seznam klientů (už odfiltrovaný
// tím, co je na stránce vidět) a vyexportuje VŠECHNA smysluplná pole modelu
// Client - vč. údajů, které v tabulce nejsou vidět (e-mail, DIČ, telefon,
// statutár, adresa). Staví se na klientovi přes izomorfní buildXlsx.

const LEGAL_LABEL: Record<Client["legalForm"], string> = {
  PO: "Právnická osoba",
  FO: "Fyzická osoba",
};

const COLUMNS: XlsxColumn[] = [
  { header: "Právní forma", width: 18 },
  { header: "Název", width: 34 },
  { header: "IČO", width: 12 },
  { header: "DIČ", width: 14 },
  { header: "Ulice", width: 26 },
  { header: "Město", width: 20 },
  { header: "PSČ", width: 10 },
  { header: "Stát", width: 14 },
  { header: "Statutár - jméno", width: 24 },
  { header: "Statutár - role", width: 20 },
  { header: "Kontakt - jméno", width: 24 },
  { header: "E-mail", width: 30 },
  { header: "Telefon", width: 18 },
  { header: "Vytvořeno", width: 14 },
  { header: "Vytvořil", width: 26 },
  { header: "Aktualizováno", width: 14 },
];

function clientRow(c: Client): CellValue[] {
  return [
    LEGAL_LABEL[c.legalForm] ?? c.legalForm,
    c.companyName,
    c.ico,
    c.dic,
    c.address?.street,
    c.address?.city,
    c.address?.zip,
    c.address?.country,
    c.statutory?.name,
    c.statutory?.role,
    c.contact?.name,
    c.contact?.email,
    c.contact?.phone,
    fmtDate(c.createdAt),
    c.createdBy,
    fmtDateTime(c.updatedAt),
  ];
}

export function buildClientsXlsx(clients: Client[]): Promise<Uint8Array> {
  const rows = clients.map(clientRow);
  return buildXlsx([{ name: "Klienti", columns: COLUMNS, rows }]);
}
