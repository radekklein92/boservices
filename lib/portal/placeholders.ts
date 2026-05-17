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
      { token: "{{clientRegistry}}", label: "Zápis v rejstříku", example: "Městský soud v Praze, oddíl C, vložka 12345" },
      { token: "{{clientBankAccount}}", label: "Bankovní účet", example: "1234567890/0100" },
      { token: "{{clientStatutoryName}}", label: "Statutární zástupce", example: "Jana Novotná" },
      { token: "{{clientStatutoryRole}}", label: "Funkce zástupce", example: "jednatelka" },
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
      { token: "{{providerRegistry}}", label: "Zápis v rejstříku", example: "Městský soud v Praze, oddíl C, vložka 442640" },
      { token: "{{providerStatutoryName}}", label: "Statutární zástupce", example: "Mgr. Ondřej Benáček" },
      { token: "{{providerStatutoryRole}}", label: "Funkce zástupce", example: "jednatel" },
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
      { token: "{{debtorRegistry}}", label: "Zápis v rejstříku", example: "Krajský soud v Brně, oddíl C, vložka 98765" },
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
      { token: "{{feePercent}}", label: "Výše úplaty (% z vymoženého)", example: "95" },
      { token: "{{paymentTermDays}}", label: "Splatnost ve dnech", example: "15" },
      { token: "{{totalClaimsAmount}}", label: "Celková výše pohledávek", example: "1 250 000 Kč" },
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
