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
  return {
    clientName: client.companyName,
    clientLegalForm:
      client.legalForm === "PO" ? "Právnická osoba" : "Fyzická osoba",
    clientIco: client.ico ?? "",
    clientDic: client.dic ?? "",
    clientStreet: client.address.street,
    clientCity: client.address.city,
    clientZip: client.address.zip,
    clientCountry: client.address.country ?? "Česká republika",
    clientRegistry: "",
    clientBankAccount: "",
    clientStatutoryName: client.statutory?.name ?? "",
    clientStatutoryRole: client.statutory?.role ?? "",
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
    debtorRegistry: "",
  };
}

const TOKEN_RE = /\{\{(\w+)\}\}/g;

export function renderTemplate(
  html: string,
  variables: ContractVariables,
): string {
  return html.replace(TOKEN_RE, (_, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null || value === "") {
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
    if (!variables[key] || variables[key].trim() === "") {
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
