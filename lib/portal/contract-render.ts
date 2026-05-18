import type { Client } from "./clients-db";

export type ContractVariables = Record<string, string>;

export const PROVIDER_DEFAULTS: ContractVariables = {
  providerName: "Business Operations Services s.r.o.",
  providerIco: "24520039",
  providerDic: "CZ24520039",
  providerStreet: "Uhelný trh 414/9",
  providerCity: "Praha 1",
  providerZip: "11000",
  providerRegistry: "Městský soud v Praze, oddíl C, vložka 442640",
  providerStatutory1Name: "Ing. Jiří Slavkovský",
  providerStatutory1Role: "jednatel",
  providerStatutory2Name: "Mgr. Jakub Pešek",
  providerStatutory2Role: "jednatel",
};

export function buildClientVariables(client: Client): ContractVariables {
  const isPO = client.legalForm === "PO";
  const statutoryName = client.statutory?.name ?? "";
  const statutoryRole = client.statutory?.role ?? "";

  // Computed pole - reflektuje právní formu klienta:
  // - PO = právnická osoba: zastupuje statutární orgán (jednatel, …)
  // - FO = fyzická osoba podnikající: jedná přímo za sebe, žádné zastoupení
  const clientRepresentationClause =
    isPO && statutoryName
      ? `, zastoupená ${statutoryName}, ${statutoryRole}`
      : "";
  const clientSignerName = isPO && statutoryName ? statutoryName : client.companyName;
  const clientSignerRole = isPO ? statutoryRole : "";

  return {
    clientName: client.companyName,
    clientLegalForm: isPO ? "Právnická osoba" : "Fyzická osoba",
    clientIco: client.ico ?? "",
    clientDic: client.dic ?? "",
    clientStreet: client.address.street,
    clientCity: client.address.city,
    clientZip: client.address.zip,
    clientCountry: client.address.country ?? "Česká republika",
    clientBankAccount: "",
    clientStatutoryName: statutoryName,
    clientStatutoryRole: statutoryRole,
    clientRepresentationClause,
    clientSignerName,
    clientSignerRole,
    clientEmail: client.contact?.email ?? "",
    clientPhone: client.contact?.phone ?? "",
  };
}

export function buildDefaultContractMeta(date = new Date()): ContractVariables {
  const formattedDate = date.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return {
    contractDate: formattedDate,
    effectiveDate: formattedDate,
    contractNumber: "",
    place: "Praha",
    originContractDate: "",
    originContractTitle: "",
    feePercent: "95",
    paymentTermDays: "15",
    totalClaimsAmount: "",
    debtorName: "",
    debtorIco: "",
    debtorStreet: "",
    debtorCity: "",
    debtorZip: "",
    provozovnaAddress: "",
    conceptName: "",
  };
}

const TOKEN_RE = /\{\{(\w+)\}\}/g;

// Klíče, které mohou být legitimně prázdné (např. clientRepresentationClause
// pro fyzickou osobu) - prázdná hodnota se renderuje jako nic, ne jako warning.
const ALLOW_EMPTY = new Set([
  "clientRepresentationClause",
  "clientSignerRole",
  "clientStatutoryName",
  "clientStatutoryRole",
  "clientDic",
  "clientBankAccount",
]);

export function renderTemplate(
  html: string,
  variables: ContractVariables,
): string {
  return html.replace(TOKEN_RE, (_, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null) {
      return `<span style="background:#f3eecf;color:#7a5b00;padding:0 4px;border-radius:3px;font-style:italic">${key}</span>`;
    }
    if (value === "") {
      if (ALLOW_EMPTY.has(key)) return "";
      return `<span style="background:#f3eecf;color:#7a5b00;padding:0 4px;border-radius:3px;font-style:italic">${key}</span>`;
    }
    return escapeHtml(value);
  });
}

export function listUnresolvedPlaceholders(
  html: string,
  variables: ContractVariables,
): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(html)) !== null) {
    const key = m[1]!;
    const value = variables[key];
    if (value === undefined || value === null) {
      out.add(key);
      continue;
    }
    if (value === "" && !ALLOW_EMPTY.has(key)) {
      out.add(key);
    }
  }
  return Array.from(out);
}

export function extractPlaceholderTokens(html: string): Set<string> {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(html)) !== null) {
    out.add(m[1]!);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
