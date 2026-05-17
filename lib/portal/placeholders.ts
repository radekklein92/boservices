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
    label: "Klient",
    items: [
      { token: "{{clientName}}", label: "Obchodní jméno", example: "BOServices s.r.o." },
      { token: "{{clientLegalForm}}", label: "Právní forma", example: "Právnická osoba" },
      { token: "{{clientIco}}", label: "IČO", example: "24520039" },
      { token: "{{clientDic}}", label: "DIČ", example: "CZ24520039" },
      { token: "{{clientStreet}}", label: "Ulice a č.p.", example: "Uhelný trh 414/9" },
      { token: "{{clientCity}}", label: "Obec", example: "Praha 1" },
      { token: "{{clientZip}}", label: "PSČ", example: "11000" },
      { token: "{{clientCountry}}", label: "Stát", example: "Česká republika" },
      { token: "{{clientStatutoryName}}", label: "Statutární zástupce", example: "Mgr. Ondřej Benáček" },
      { token: "{{clientStatutoryRole}}", label: "Funkce zástupce", example: "jednatel" },
    ],
  },
  {
    key: "provider",
    label: "Poskytovatel (BOServices)",
    items: [
      { token: "{{providerName}}", label: "Obchodní jméno", example: "Business Operations Services s.r.o." },
      { token: "{{providerIco}}", label: "IČO", example: "24520039" },
      { token: "{{providerDic}}", label: "DIČ", example: "CZ24520039" },
      { token: "{{providerStreet}}", label: "Ulice a č.p.", example: "Uhelný trh 414/9" },
      { token: "{{providerCity}}", label: "Obec", example: "Praha 1" },
      { token: "{{providerZip}}", label: "PSČ", example: "11000" },
      { token: "{{providerStatutoryName}}", label: "Statutární zástupce", example: "Mgr. Ondřej Benáček" },
      { token: "{{providerStatutoryRole}}", label: "Funkce zástupce", example: "jednatel" },
    ],
  },
  {
    key: "contract",
    label: "Smlouva",
    items: [
      { token: "{{contractNumber}}", label: "Číslo smlouvy", example: "2026/001" },
      { token: "{{contractDate}}", label: "Datum uzavření", example: "17. května 2026" },
      { token: "{{effectiveDate}}", label: "Datum účinnosti", example: "1. června 2026" },
      { token: "{{place}}", label: "Místo uzavření", example: "Praha" },
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
