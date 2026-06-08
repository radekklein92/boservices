import type { Client } from "./clients-db";
import { signerRoleText, type User } from "./users-db";
import { findPlaceholderLabel } from "./placeholders";

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
// naplníme jinou firmou. Za Clamoru jedná Mgr. Petr Zapletal na základě plné moci.
export const CLAMORA_BRIDGE_DEFAULTS: ContractVariables = {
  providerName: "Clamora Bridge s.r.o.",
  providerIco: "29582181",
  providerDic: "",
  providerStreet: "Příčná 1892/4",
  providerCity: "Praha 1",
  providerZip: "11000",
  providerRegistry: "Městský soud v Praze, oddíl C, vložka 448879",
  providerStatutory1Name: "Mgr. Petr Zapletal",
  providerStatutory1Role: "na základě plné moci",
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

// Když je u smlouvy vybrán Podepisující (signerEmail), přepíšeme statutary
// pole v PDF jeho daty. signerDisplayName umožňuje formální tvar včetně titulu
// (např. "Ing. Jiří Slavkovský"), který v User.name typicky není.
export function applySignerOverride(
  variables: ContractVariables,
  signer: Pick<
    User,
    | "name"
    | "signerDisplayName"
    | "signerFunction"
    | "signerPoaSubstituteFor"
    | "isSigner"
  >,
  // poa = NDA: podepisuje kterýkoliv uživatel s telefonem. Role se vezme podle
  // jeho funkce (jednatel/substituční PM jako u ostatních smluv); kdo funkci nemá,
  // podepisuje „na základě plné moci". Bez ohledu na isSigner.
  opts?: { poa?: boolean },
): ContractVariables {
  if (!opts?.poa && (!signer.isSigner || !signer.signerFunction)) return variables;
  const role = opts?.poa
    ? signerRoleText(signer) || "na základě plné moci"
    : signerRoleText(signer);
  return {
    ...variables,
    providerStatutory1Name:
      signer.signerDisplayName?.trim() || signer.name || variables.providerStatutory1Name,
    providerStatutory1Role: role,
  };
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

// Odstoupení - skládá INLINE klauzule podle toho, které smlouvy jsou v balíčku
// a jak se ukončují. A: primárně MS (FS padá § 1727); B: primárně FS (MS padá).
// KS (kupní) volitelně u obou; MS (manažerská) volitelně u B (nemusela být
// podepsaná). Tokeny jsou ČISTĚ INLINE (žádné <li>/<ol>), aby je Tiptap při
// otevření editoru nepřebaloval do <li> a nerozbíjel strukturu (= dřív „falešné
// změny" + vadné PDF).
//  - depIntroPhrase: výčet uzavřených smluv v Úvodním prohlášení (nominativ).
//  - depDropPhrase: závislé smlouvy zanikající dle § 1727 (genitiv, „též X a Y").
//  - ksPreservedNote: dovětek, že KS zůstává v platnosti (když nepadá).
//  - managerPartyLine: řádek Manažera ve Smluvních stranách (prázdný, když u B
//    MS nebyla podepsána). Hodnoty manažera se zapékají rovnou (escapované).
export function composeWithdrawalDeps(
  variant: string,
  opts: {
    msIncluded: boolean;
    ksDropped: boolean;
    manager?: { name?: string; ico?: string; street?: string; city?: string; zip?: string };
    seller?: { name?: string; ico?: string; street?: string; city?: string; zip?: string };
  },
): {
  depIntroPhrase: string;
  depDropPhrase: string;
  ksPreservedNote: string;
  managerPartyLine: string;
  sellerPartyLine: string;
  dependencyClause: string;
} {
  const isA = variant === "A";
  const msIncluded = isA ? true : opts.msIncluded;
  const ksDropped = opts.ksDropped;

  const join = (items: string[]): string =>
    items.length <= 1
      ? items.join("")
      : `${items.slice(0, -1).join(", ")} a ${items[items.length - 1]}`;

  const FS_N = "<strong>Franšízingová smlouva (FS)</strong>";
  const MS_N = "<strong>Smlouva o provozování provozovny (MS)</strong>";
  const KS_N = "<strong>Kupní smlouva k vybavení (KS)</strong>";
  const FS_G = "<strong>Franšízingové smlouvy (FS)</strong>";
  const MS_G = "<strong>Smlouvy o provozování provozovny (MS)</strong>";
  const KS_G = "<strong>Kupní smlouvy k vybavení (KS)</strong>";

  const intro: string[] = [];
  const dep: string[] = [];
  if (isA) {
    intro.push(MS_N, FS_N);
    dep.push(FS_G);
  } else {
    intro.push(FS_N);
    if (msIncluded) {
      intro.push(MS_N);
      dep.push(MS_G);
    }
  }
  if (ksDropped) {
    intro.push(KS_N);
    dep.push(KS_G);
  }

  const m = opts.manager ?? {};
  const esc = (s?: string) =>
    (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const managerPartyLine = msIncluded
    ? `<strong>${esc(m.name)}</strong>, IČO: ${esc(m.ico)}, se sídlem ${esc(m.street)}, ${esc(m.zip)} ${esc(m.city)} (dále jen „<strong>Manažer</strong>“)`
    : "";

  // Prodávající (smluvní strana KS) - uvádí se jen když KS padá s ostatními, aby
  // bylo odstoupení účinné i vůči němu. Může být jiný subjekt než Poskytovatel.
  const s = opts.seller ?? {};
  const sellerPartyLine = ksDropped
    ? `<strong>${esc(s.name)}</strong>, IČO: ${esc(s.ico)}, se sídlem ${esc(s.street)}, ${esc(s.zip)} ${esc(s.city)} (dále jen „<strong>Prodávající</strong>“)`
    : "";

  // Bod 4 (§ 1727) jako jedna složená věta - aby NIKDY nevznikla nesmyslná
  // „dochází k zániku  jako smluv závislých" (prázdný výčet) a aby sedělo číslo
  // (1 smlouva = „jako smlouvy závislé", víc = „jako smluv závislých"). Když
  // žádná závislá smlouva nezaniká (B bez MS, KS zůstává), zbyde jen dovětek o KS.
  const ksPreservedSentence = ksDropped
    ? ""
    : `Pro vyloučení pochybností se odstoupení <strong>nevztahuje na Kupní smlouvu k vybavení (KS)</strong>; ta není ve smyslu § 1727 OZ závislá, její účel je splněn a zůstává v platnosti.`;
  let dependencyClause = "";
  if (dep.length) {
    const noun = dep.length === 1 ? "smlouvy závislé" : "smluv závislých";
    dependencyClause = `Zároveň podle <strong>§ 1727 občanského zákoníku</strong> dochází k zániku ${join(dep)} jako ${noun}.`;
  }
  if (ksPreservedSentence) {
    dependencyClause = dependencyClause
      ? `${dependencyClause} ${ksPreservedSentence}`
      : ksPreservedSentence;
  }

  return {
    depIntroPhrase: join(intro),
    depDropPhrase: dep.length ? `též ${join(dep)}` : "",
    ksPreservedNote: ksPreservedSentence ? ` ${ksPreservedSentence}` : "",
    managerPartyLine,
    sellerPartyLine,
    dependencyClause,
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
  // Conditional bloky pro odstoupení od smluv - prázdný řetězec znamená
  // "tato klauzule se v dokumentu neuplatní".
  "ksDropClause",
  "ksPreservedClause",
  "ksIntroClause",
  "msIntroClause",
  "depIntroPhrase",
  "depDropPhrase",
  "ksPreservedNote",
  "managerPartyLine",
  "sellerPartyLine",
  "dependencyClause",
  // Příloha č. 1 - tabulka pohledávek se generuje systémově z contract.claims.
  "claimsTable",
]);

// Placeholdery, jejichž hodnoty se NEescapují - hodnota je raw HTML zlomek.
// Pozor: tyto hodnoty musí být generované systémově (např. ksPreservedClause
// se nastavuje z konstanty v WITHDRAWAL_KS_TEXTS), nikdy uživatelem volně,
// jinak by hrozila XSS injekce do PDF.
const RAW_HTML_PLACEHOLDERS = new Set([
  "ksPreservedClause",
  "ksIntroClause",
  "msIntroClause",
  "depIntroPhrase",
  "depDropPhrase",
  "ksPreservedNote",
  "managerPartyLine",
  "sellerPartyLine",
  "dependencyClause",
  // Vygenerovaná HTML tabulka pohledávek (Příloha č. 1). Hodnotu skládá systém
  // z contract.claims (renderClaimsTableHtml), uživatel ji nezadává volně, takže
  // nehrozí XSS - veškerý uživatelský text je escapovaný uvnitř helperu.
  "claimsTable",
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

// Tokeny, které se NEzapékají do editovatelného textu - dosadí se až při
// generování PDF, protože jsou řízené strukturou (tabulka pohledávek) nebo
// přepínačem (nakládání s KS u odstoupení).
export const KEEP_DYNAMIC_TOKENS = new Set([
  "claimsTable",
  "totalClaimsAmount",
  "ksIntroClause",
  "ksPreservedClause",
  "ksDropClause",
  "ksIntroLineSeparator",
  "msIntroClause",
  "depIntroPhrase",
  "depDropPhrase",
  "ksPreservedNote",
  "managerPartyLine",
  "sellerPartyLine",
  "dependencyClause",
]);

// Obal zapečené hodnoty - neviditelná značka s klíčem (Tiptap mark
// placeholderValue), aby šlo hodnotu z pole spolehlivě přepsat v textu.
function phSpan(key: string, innerHtml: string): string {
  return `<span data-ph="${key}">${innerHtml}</span>`;
}

function emptyMarker(key: string): string {
  return escapeHtml(`[${findPlaceholderLabel(`{{${key}}}`) ?? key}]`);
}

// „Zapeče" placeholdery do HTML pro přímou editaci ve znění smlouvy: hodnoty
// dosadí natvrdo (obalené značkou data-ph), prázdné/chybějící nahradí markerem
// [Label] k vyplnění a dynamické tokeny (KEEP_DYNAMIC_TOKENS) nechá být.
export function resolveForEditing(
  html: string,
  variables: ContractVariables,
): string {
  return html.replace(TOKEN_RE, (whole, key: string) => {
    if (KEEP_DYNAMIC_TOKENS.has(key)) return whole;
    const value = variables[key];
    if (value === undefined || value === null || value === "") {
      if (ALLOW_EMPTY.has(key)) return "";
      return phSpan(key, emptyMarker(key));
    }
    if (RAW_HTML_PLACEHOLDERS.has(key)) return value;
    return phSpan(key, escapeHtml(value));
  });
}

// Opak resolveForEditing pro editovatelný režim „placeholdery": zapečené data-ph
// spany převede zpět na {{token}}, ALE jen pokud jejich obsah stále odpovídá
// hodnotě proměnné (= nedotčený placeholder). Ručně přepsaný obsah ponechá jako
// literální text (token se zahodí, text zůstane - žádná ztráta ruční úpravy).
// KEEP_DYNAMIC {{tokeny}} i literální text uživatele zůstávají beze změny.
// Použití: zobrazení/úprava placeholderů + kopírování znění mezi smlouvami.
const DATA_PH_SPAN_RE = /<span[^>]*\bdata-ph="(\w+)"[^>]*>([\s\S]*?)<\/span>/g;
export function bakedToTokenHtml(
  html: string,
  variables: ContractVariables,
  // Klíče tokenů reálně použité v šabloně smlouvy - u shodné hodnoty se z víc
  // proměnných preferuje klíč ze šablony (např. {{clientSignerName}} v podpisu
  // vyhraje nad metadatovým contactName se stejnou hodnotou).
  validKeys?: Set<string>,
): string {
  // 1) Zapečené data-ph spany -> {{token}} (jen nedotčené; ručně přepsané = literál).
  let out = html.replace(DATA_PH_SPAN_RE, (_m, key: string, inner: string) => {
    const value = variables[key];
    const expected =
      value === undefined || value === null || value === ""
        ? emptyMarker(key)
        : escapeHtml(value);
    return inner === expected ? `{{${key}}}` : inner;
  });

  // 2) Hodnoty zapečené BEZ spanu (RAW/legacy/server render) - zpětně na {{token}}
  //    shodou textu hodnoty. Pojistky: jen neprázdné a dost dlouhé hodnoty
  //    (>= 4 znaky), nejdelší první (kvůli podřetězcům), KEEP_DYNAMIC vynecháme.
  //    Při shodné hodnotě u víc proměnných vyhraje PRVNÍ klíč (zachová pořadí
  //    proměnných - např. contractDate před effectiveDate); hodnota je správná,
  //    jen u zcela identických polí může token reprezentovat jedno z nich.
  const byValue = new Map<string, string>();
  for (const [key, value] of Object.entries(variables)) {
    if (!value || value.trim().length < 4) continue;
    if (KEEP_DYNAMIC_TOKENS.has(key)) continue;
    const enc = escapeHtml(value);
    const existing = byValue.get(enc);
    if (existing === undefined) {
      byValue.set(enc, key);
    } else if (validKeys && !validKeys.has(existing) && validKeys.has(key)) {
      // Upgrade: stávající klíč není v šabloně, nový ano -> preferuj šablonový.
      byValue.set(enc, key);
    }
  }
  const entries = [...byValue.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [enc, key] of entries) {
    if (out.includes(enc)) out = out.split(enc).join(`{{${key}}}`);
  }
  return out;
}

// Přepíše obsah všech značek data-ph daného klíče v zapečeném HTML novou
// hodnotou (escaped); prázdná hodnota → marker [Label]. Klíčované = bez kolizí.
// Tolerantní k pořadí atributů (Tiptap může span přerenderovat).
export function setBakedValue(
  html: string,
  key: string,
  value: string,
): string {
  const inner =
    value && value.trim() !== "" ? escapeHtml(value) : emptyMarker(key);
  const re = new RegExp(
    `(<span[^>]*\\bdata-ph="${key}"[^>]*>)([\\s\\S]*?)(<\\/span>)`,
    "g",
  );
  return html.replace(re, (_m, open: string, _content: string, close: string) =>
    `${open}${inner}${close}`,
  );
}

// Odstraní obal značek data-ph (ponechá obsah) - pro PDF a diff, ať tam
// nezůstávají pomocné spany.
export function stripPlaceholderSpans(html: string): string {
  return html.replace(
    /<span[^>]*\bdata-ph="[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
    "$1",
  );
}

// Hodnota tokenu pro vkládání z palety placeholderů do už zapečeného textu
// (vrací hodnotu, nebo [Label] když je prázdná).
export function resolvePlaceholderValue(
  token: string,
  variables: ContractVariables,
): string {
  const m = token.match(/\{\{(\w+)\}\}/);
  const key = m ? m[1]! : token;
  const value = variables[key];
  if (value === undefined || value === null || value === "") {
    const label = findPlaceholderLabel(token) ?? key;
    return `[${label}]`;
  }
  return value;
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

// Připraví snapshot šablony pro diff proti znění smlouvy. U zapečených smluv
// (html už nemá {{tokeny}} kromě dynamických) zapeče stejnými proměnnými i
// šablonu, takže diff ukáže jen uživatelské úpravy, ne rozdíl „token vs
// hodnota". U starých nezapečených smluv vrátí surový snapshot. Sdílené webovým
// (Přehled změn) i PDF (PDF s úpravami) diffem - ať nemohou divergovat.
export function bakeSnapshotForDiff(
  snapshot: string,
  html: string,
  variables: ContractVariables,
): string {
  const tokens = extractPlaceholderTokens(html);
  const isBaked = ![...tokens].some((t) => !KEEP_DYNAMIC_TOKENS.has(t));
  return isBaked ? resolveForEditing(snapshot, variables) : snapshot;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Obalí podpisovou sekci („Podpisy" h2 + datum + podpisové bloky) do .signatures
// (page-break-inside: avoid), aby se datum podpisu neoddělilo od podpisů přes
// konec stránky. Obalí od <h2>Podpisy</h2> po další <h2> (nebo konec dokumentu).
// Idempotentní; aplikuje se jen při renderu PDF, ne na uložené HTML.
const SIGNATURES_RE = /(<h2[^>]*>\s*Podpisy\s*<\/h2>)([\s\S]*?)(?=<h2[^>]*>|$)/i;

export function wrapSignatures(html: string): string {
  if (html.includes('class="signatures"')) return html;
  return html.replace(SIGNATURES_RE, '<div class="signatures">$1$2</div>');
}

// Seskupí každý pár „datum + podpis" do .sign-unit (break-inside: avoid), aby
// datum a jeho podpis NIKDY neskončily na různých stránkách - ale jednotlivé
// podpisy už smí přetéct na další stránku a využít zbytek předchozí (.signatures
// jako celek se proto nezalamuje pohromadě). Skupina = volitelný řádek data
// „V … dne …" + případné prázdné odstavce + odstavec podpisu (začíná podtržítky).
// Idempotentní; aplikuje se jen při renderu PDF. Funguje na token i zapečené formě.
const SIGN_UNIT_RE =
  /((?:<p>\s*V\b[^<]*\bdne\b[^<]*<\/p>\s*|<p>(?:&nbsp;|\s| )*<\/p>\s*)*)(<p>_{6,}[\s\S]*?<\/p>)/g;

export function groupSignatureUnits(html: string): string {
  if (html.includes('class="sign-unit"')) return html;
  return html.replace(
    SIGN_UNIT_RE,
    (_m, lead: string, sig: string) =>
      `<div class="sign-unit">${lead}${sig}</div>`,
  );
}

// NDA (DigiSign): nad každého podepisujícího vstříkne neviditelnou DigiSign kotvu
// (zástupný text, na který se zakotví podpisové pole) + mezeru pro pole, a celý
// jeho blok (mezera + jméno/role/za koho) zabalí do .sign-unit (break-inside:
// avoid), aby se podpisové pole s údaji NIKDY nerozdělily přes konec stránky -
// když se nevejdou, jdou celé na další stránku. Kotva NENÍ v uloženém HTML
// (Tiptap by styl/span zahodil a text by zviditelnil) - přidává se až tady, při
// renderu PDF. Svislé zarovnání pole řeší digisign-send (positioning bottom_left).
const NDA_SIG_GAP = '<div style="height:84px"></div>';
const ndaAnchor = (id: string) =>
  `<span style="font-size:2px;color:transparent">${id}</span>`;

export function wrapNdaSignatureUnits(html: string): string {
  let out = html.replace(
    /<p>((?:(?!<\/p>)[\s\S])*?za Poskytující stranu: Business Operations Services s\.r\.o\.)<\/p>/,
    `<div class="sign-unit">${NDA_SIG_GAP}<p>${ndaAnchor("signBosFld")}$1</p></div>`,
  );
  out = out.replace(
    /<p>((?:(?!<\/p>)[\s\S])*?za Přijímající stranu:(?:(?!<\/p>)[\s\S])*?)<\/p>/,
    `<div class="sign-unit">${NDA_SIG_GAP}<p>${ndaAnchor("signClientFld")}$1</p></div>`,
  );
  return out;
}
