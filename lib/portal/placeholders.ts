export type PlaceholderGroup = {
  key: string;
  label: string;
  items: PlaceholderItem[];
};

export type PlaceholderItem = {
  token: string;
  label: string;
  example: string;
};

export const PLACEHOLDER_GROUPS: PlaceholderGroup[] = [
  {
    key: "client",
    label: "Klient / Postupitel",
    items: [
      { token: "{{clientName}}", label: "Obchodní jméno", example: "Vaše značka s.r.o." },
      { token: "{{clientLegalForm}}", label: "Právní forma", example: "Právnická osoba" },
      { token: "{{clientIco}}", label: "IČO", example: "12345678" },
      { token: "{{clientDic}}", label: "DIČ", example: "CZ12345678" },
      { token: "{{clientStreet}}", label: "Ulice a č.p.", example: "Václavské náměstí 1" },
      { token: "{{clientCity}}", label: "Obec", example: "Praha 1" },
      { token: "{{clientZip}}", label: "PSČ", example: "11000" },
      { token: "{{clientCountry}}", label: "Stát", example: "Česká republika" },
      { token: "{{clientBankAccount}}", label: "Bankovní účet", example: "1234567890/0100" },
      { token: "{{clientStatutoryName}}", label: "Statutární zástupce (PO)", example: "Jana Novotná" },
      { token: "{{clientStatutoryRole}}", label: "Funkce zástupce (PO)", example: "jednatelka" },
      { token: "{{clientRepresentationClause}}", label: "Klauzule o zastoupení (auto)", example: ", zastoupená Jana Novotná, jednatelka" },
      { token: "{{clientSignerName}}", label: "Jméno podepisujícího (auto)", example: "Jana Novotná / Radek Klein" },
      { token: "{{clientSignerRole}}", label: "Funkce podepisujícího (auto)", example: "jednatelka / —" },
      { token: "{{clientEmail}}", label: "E-mail", example: "jana@brand.cz" },
      { token: "{{clientPhone}}", label: "Telefon", example: "+420 ..." },
    ],
  },
  {
    key: "provider",
    label: "Poskytovatel / Postupník (BOServices)",
    items: [
      { token: "{{providerName}}", label: "Obchodní jméno", example: "Business Operations Services s.r.o." },
      { token: "{{providerIco}}", label: "IČO", example: "24520039" },
      { token: "{{providerDic}}", label: "DIČ", example: "CZ24520039" },
      { token: "{{providerStreet}}", label: "Ulice a č.p.", example: "Uhelný trh 414/9" },
      { token: "{{providerCity}}", label: "Obec", example: "Praha 1" },
      { token: "{{providerZip}}", label: "PSČ", example: "11000" },
      { token: "{{providerStatutory1Name}}", label: "1. zástupce - jméno", example: "Ing. Jiří Slavkovský" },
      { token: "{{providerStatutory1Role}}", label: "1. zástupce - funkce", example: "jednatel" },
      { token: "{{providerStatutory2Name}}", label: "2. zástupce - jméno", example: "Mgr. Jakub Pešek" },
      { token: "{{providerStatutory2Role}}", label: "2. zástupce - funkce", example: "jednatel" },
    ],
  },
  {
    key: "debtor",
    label: "Dlužník (třetí strana)",
    items: [
      { token: "{{debtorName}}", label: "Obchodní jméno", example: "Dlužník s.r.o." },
      { token: "{{debtorIco}}", label: "IČO", example: "98765432" },
      { token: "{{debtorStreet}}", label: "Ulice a č.p.", example: "Hlavní 100" },
      { token: "{{debtorCity}}", label: "Obec", example: "Brno" },
      { token: "{{debtorZip}}", label: "PSČ", example: "60200" },
    ],
  },
  {
    key: "contract",
    label: "Smlouva",
    items: [
      { token: "{{contractNumber}}", label: "Číslo smlouvy", example: "2026/001" },
      { token: "{{contractDate}}", label: "Datum uzavření", example: "18. května 2026" },
      { token: "{{effectiveDate}}", label: "Datum účinnosti", example: "1. června 2026" },
      { token: "{{place}}", label: "Místo uzavření", example: "Praha" },
      { token: "{{originContractDate}}", label: "Datum původní smlouvy", example: "1. ledna 2026" },
      { token: "{{originContractTitle}}", label: "Předmět původní smlouvy", example: "dodávkách zboží" },
      { token: "{{totalClaimsAmount}}", label: "Celková výše pohledávek", example: "1 250 000 Kč" },
      { token: "{{provozovnaAddress}}", label: "Adresa provozovny", example: "Václavské nám. 1, Praha 1" },
      { token: "{{conceptName}}", label: "Název franšízingového konceptu", example: "Coffee&Bagels" },
      { token: "{{franchiseFeePercent}}", label: "Franšízový poplatek (%)", example: "8" },
    ],
  },
  {
    key: "manager",
    label: "Manažer (odstoupení)",
    items: [
      { token: "{{managerName}}", label: "Obchodní jméno", example: "Twistcafe s.r.o." },
      { token: "{{managerIco}}", label: "IČO", example: "07177658" },
      { token: "{{managerStreet}}", label: "Ulice a č.p.", example: "Hlavní 1" },
      { token: "{{managerCity}}", label: "Obec", example: "Praha 1" },
      { token: "{{managerZip}}", label: "PSČ", example: "11000" },
    ],
  },
  {
    key: "withdrawal",
    label: "Odstoupení od smluv",
    items: [
      { token: "{{originContractsDate}}", label: "Datum uzavření MS+FS (+KS)", example: "1. ledna 2026" },
      { token: "{{withdrawalLocation}}", label: "Lokace (předmět smluv)", example: "Kytky od Pepy Štefánikova Praha" },
      { token: "{{leaseLostDate}}", label: "Datum ztráty nájmu (var. B)", example: "1. dubna 2026" },
      { token: "{{ksIntroLineSeparator}}", label: "KS — oddělovač FS řádku (auto)", example: ";" },
      { token: "{{ksIntroClause}}", label: "KS — bod 3 v úvodu (auto)", example: "<li>Kupní smlouva k vybavení…</li>" },
      { token: "{{ksDropClause}}", label: "KS — doplnění do bodu 4 (auto)", example: " a Kupní smlouvy k vybavení (KS)" },
      { token: "{{ksPreservedClause}}", label: "KS — bod 5 prohlášení (auto)", example: "<li>Pro vyloučení pochybností…</li>" },
    ],
  },
];

export function findPlaceholderLabel(token: string): string | undefined {
  for (const group of PLACEHOLDER_GROUPS) {
    const item = group.items.find((i) => i.token === token);
    if (item) return item.label;
  }
  return undefined;
}
