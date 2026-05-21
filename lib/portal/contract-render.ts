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
};

// Postupník v 3 šablonách postoupení pohledávek (claim-assignment, side-fee,
// assignment-notice) a v balíčku „claim-bundle" je Clamora Bridge s.r.o., ne
// BOServices. Šablony používají stejné {{provider*}} placeholdery, jen je
// naplníme jinou firmou. Statutární zástupce je shodný s BOServices (Slavkovský).
export const CLAMORA_BRIDGE_DEFAULTS: ContractVariables = {
  providerName: "Clamora Bridge s.r.o.",
  providerIco: "29582181",
  providerDic: "",
  providerStreet: "Příčná 1892/4",
  providerCity: "Praha 1",
  providerZip: "11000",
  providerRegistry: "Městský soud v Praze, oddíl C, vložka 448879",
  providerStatutory1Name: "Ing. Jiří Slavkovský",
  providerStatutory1Role: "jednatel",
};

// Typy smluv, kde Postupník/Poskytovatel je Clamora Bridge (postoupení
// pohledávek a jeho balíček), oproti BOServices u ostatních typů.
const CLAMORA_PROVIDER_TYPES = new Set([
  "claim-bundle",
  "claim-assignment",
  "side-fee",
  "assignment-notice",
]);

export function getProviderDefaults(type: string): ContractVariables {
  return CLAMORA_PROVIDER_TYPES.has(type)
    ? CLAMORA_BRIDGE_DEFAULTS
    : PROVIDER_DEFAULTS;
}

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
    // Odstoupení od smluv
    originContractsDate: "",
    withdrawalLocation: "",
    leaseLostDate: "",
    ksDropClause: "",
    ksPreservedClause: "",
    ksIntroLineSeparator: ";",
    ksIntroClause: "",
    // Manažer (odstoupení) - obě firmy (Manažer i Poskytovatel) si user vybere
    // ze stejných 7 preset firem. Proto pro withdrawal nepředplňujeme
    // provider* PROVIDER_DEFAULTS (řeší se v POST /api/portal/contracts).
    managerName: "",
    managerIco: "",
    managerStreet: "",
    managerCity: "",
    managerZip: "",
  };
}

// Hotové texty pro toggle „nakládání s KS" v odstoupení od smluv. Při změně
// nastavení (KS padá / KS zůstává v platnosti) klient nastaví všechny 4 hodnoty.
//
// Význam:
// - ksIntroLineSeparator: zakončení FS řádku v Úvodním prohlášení (";" pokud
//   za FS následuje KS bod 3, "." pokud je FS poslední položkou seznamu).
// - ksIntroClause: celý <li> bod 3 s Kupní smlouvou k vybavení v Úvodním
//   prohlášení. Zobrazuje se jen když KS padá s ostatními.
// - ksDropClause: dovětek „ a Kupní smlouvy k vybavení (KS)" v bodě 4 Odstoupení.
// - ksPreservedClause: bod 5 s prohlášením, že KS zůstává v platnosti.
export const WITHDRAWAL_KS_TEXTS = {
  dropped: {
    ksIntroLineSeparator: ";",
    ksIntroClause:
      `<li><p><strong>Kupní smlouva k vybavení</strong> mezi Odesílatelem ` +
      `a Manažerem (dále jen „<strong>KS</strong>“).</p></li>`,
    ksDropClause: " a Kupní smlouvy k vybavení (KS)",
    ksPreservedClause: "",
  },
  preserved: {
    ksIntroLineSeparator: ".",
    ksIntroClause: "",
    ksDropClause: "",
    ksPreservedClause:
      `<li>Pro vyloučení pochybností Odesílatel prohlašuje, že odstoupení se ` +
      `<strong>nevztahuje na Kupní smlouvu k vybavení (KS)</strong>; ` +
      `KS není ve smyslu § 1727 OZ závislá, její účel je splněn a Odesílatel ` +
      `má zájem na jejím zachování.</li>`,
  },
} as const;

export type WithdrawalKsMode = keyof typeof WITHDRAWAL_KS_TEXTS;

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
  // Conditional bloky pro odstoupení od smluv - prázdný řetězec znamená
  // "tato klauzule se v dokumentu neuplatní".
  "ksDropClause",
  "ksPreservedClause",
  "ksIntroClause",
]);

// Placeholdery, jejichž hodnoty se NEescapují - hodnota je raw HTML zlomek.
// Pozor: tyto hodnoty musí být generované systémově (např. ksPreservedClause
// se nastavuje z konstanty v WITHDRAWAL_KS_TEXTS), nikdy uživatelem volně,
// jinak by hrozila XSS injekce do PDF.
const RAW_HTML_PLACEHOLDERS = new Set([
  "ksPreservedClause",
  "ksIntroClause",
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
    if (RAW_HTML_PLACEHOLDERS.has(key)) return value;
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
