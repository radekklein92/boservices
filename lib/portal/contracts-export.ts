import { buildXlsx, type XlsxColumn, type CellValue } from "./xlsx-writer";
import { fmtDate, fmtDateTime } from "./export-format";
import {
  CONTRACT_STATUS_LABEL,
  contractDisplayStatus,
  clientSignedAtEffective,
  type Contract,
} from "./contracts-db";
import { CONTRACT_TYPE_META } from "./contract-types";

// Klientský XLSX export stránky Smlouvy: vezme seznam smluv (už odfiltrovaný
// tím, co je na stránce vidět - typ, stav, hledání) a vyexportuje smysluplná
// pole modelu Contract. Surová/nevhodná pole (html, templateSnapshot,
// bundleSections, variables, claims) se do tabulky nedávají. Stav bereme
// ZOBRAZOVANÝ (contractDisplayStatus), ať sedí s chipem v seznamu (vč. DigiSign
// mezistavu); podpis klienta z clientSignedAtEffective (clientSignedAt nebo
// DigiSign mezistav). Staví se na klientovi přes izomorfní buildXlsx.

const DIGISIGN_LABEL: Record<
  NonNullable<Contract["digisignStatus"]>,
  string
> = {
  sent: "Odesláno",
  signed: "Podepsáno",
  declined: "Odmítnuto",
  voided: "Zneplatněno",
};

const COLUMNS: XlsxColumn[] = [
  { header: "Číslo", width: 12 },
  { header: "Typ", width: 34 },
  { header: "Varianta", width: 10 },
  { header: "Klient", width: 30 },
  { header: "Lokalita", width: 24 },
  { header: "Účetní středisko", width: 16 },
  { header: "Kategorie lokality", width: 18 },
  { header: "Stav", width: 20 },
  { header: "Vytvořeno", width: 14 },
  { header: "Vytvořil", width: 26 },
  { header: "Odesláno ke schválení", width: 18 },
  { header: "Odeslal", width: 26 },
  { header: "Schváleno", width: 16 },
  { header: "Schválil", width: 26 },
  { header: "Podpis BOS", width: 16 },
  { header: "Podepsal (BOS)", width: 26 },
  { header: "Podpis klienta", width: 16 },
  { header: "DigiSign stav", width: 14 },
  { header: "DigiSign odesláno", width: 16 },
  { header: "Sken nahrán", width: 16 },
  { header: "Sken nahrál", width: 26 },
  { header: "Zrušeno", width: 16 },
  { header: "Zrušil", width: 26 },
  { header: "Důvod zrušení", width: 30 },
  { header: "Aktualizováno", width: 16 },
  { header: "PDF", width: 40 },
  { header: "Sken (PDF)", width: 40 },
];

function contractRow(
  c: Contract,
  accountingCenters: Record<string, string>,
): CellValue[] {
  return [
    c.number,
    CONTRACT_TYPE_META[c.type]?.fullName ?? c.type,
    c.variant,
    c.clientName,
    c.locationSnapshot?.name,
    c.locationId ? accountingCenters[c.locationId] : undefined,
    c.locationSnapshot?.category ?? undefined,
    CONTRACT_STATUS_LABEL[contractDisplayStatus(c)],
    fmtDate(c.createdAt),
    c.createdBy,
    fmtDateTime(c.submittedForApprovalAt),
    c.submittedForApprovalByName ?? c.submittedForApprovalBy,
    fmtDateTime(c.approvedAt),
    c.approvedBy,
    fmtDateTime(c.signedAt),
    c.signedBy,
    fmtDateTime(clientSignedAtEffective(c)),
    c.digisignStatus ? DIGISIGN_LABEL[c.digisignStatus] : undefined,
    fmtDateTime(c.digisignSentAt),
    fmtDateTime(c.scanUploadedAt),
    c.scanUploadedBy,
    fmtDateTime(c.cancelledAt),
    c.cancelledByName ?? c.cancelledBy,
    c.cancelReason,
    fmtDateTime(c.updatedAt),
    c.generatedPdfUrl,
    c.scanPdfUrl,
  ];
}

export function buildContractsXlsx(
  contracts: Contract[],
  // locationId -> účetní středisko (POHODA zkratka) z listAccountingCentersByLocation.
  accountingCenters: Record<string, string>,
): Promise<Uint8Array> {
  const rows = contracts.map((c) => contractRow(c, accountingCenters));
  return buildXlsx([{ name: "Smlouvy", columns: COLUMNS, rows }]);
}
