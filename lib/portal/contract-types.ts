export const CONTRACT_TYPES = [
  "franchise",
  "cooperation",
  "operation",
  "claim-bundle",
  "claim-assignment",
  "side-fee",
  "assignment-notice",
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

// Typy, které lze nově vytvořit z modálu „Nová smlouva". Bundle „claim-bundle"
// nahrazuje 3 původní samostatné typy (claim-assignment/side-fee/assignment-notice).
// Ty zůstávají v CONTRACT_TYPES kvůli zpětné kompatibilitě (otvírání existujících
// záznamů, správa šablon), ale nelze je již nově zakládat samostatně.
export const CONTRACT_TYPES_PICKABLE = [
  "franchise",
  "cooperation",
  "operation",
  "claim-bundle",
] as const;

// Sekce, ze kterých se skládá balíček postoupení pohledávek (v tomto pořadí).
export const CLAIM_BUNDLE_SECTIONS = [
  "claim-assignment",
  "side-fee",
  "assignment-notice",
] as const;

export type ClaimBundleSectionType = (typeof CLAIM_BUNDLE_SECTIONS)[number];

export type ContractTypeMeta = {
  key: ContractType;
  shortName: string;
  fullName: string;
  description: string;
};

export const CONTRACT_TYPE_META: Record<ContractType, ContractTypeMeta> = {
  franchise: {
    key: "franchise",
    shortName: "Franšízingová",
    fullName: "Franšízingová smlouva",
    description: "Hlavní smlouva mezi franšízantem a značkou.",
  },
  cooperation: {
    key: "cooperation",
    shortName: "Spolupráce a podpora",
    fullName: "Smlouva o spolupráci a podpoře při provozování provozovny",
    description: "Doplňuje provozní povinnosti a podporu, kterou poskytujeme.",
  },
  operation: {
    key: "operation",
    shortName: "Provozování provozovny",
    fullName: "Smlouva o provozování provozovny",
    description: "Předmět: denní provoz konkrétní prodejny.",
  },
  "claim-assignment": {
    key: "claim-assignment",
    shortName: "Postoupení pohledávek",
    fullName: "Smlouva o postoupení pohledávek",
    description: "Cese pohledávek vzniklých z provozu prodejny.",
  },
  "side-fee": {
    key: "side-fee",
    shortName: "Vedlejší ujednání o úplatě",
    fullName: "Vedlejší ujednání o úplatě",
    description: "Doplněk k hlavní smlouvě upravující výši a splatnost úplaty.",
  },
  "assignment-notice": {
    key: "assignment-notice",
    shortName: "Oznámení o postoupení",
    fullName: "Oznámení o postoupení pohledávky",
    description: "Jednostranné oznámení dlužníkovi o postoupení pohledávky.",
  },
  "claim-bundle": {
    key: "claim-bundle",
    shortName: "Postoupení pohledávek",
    fullName: "Postoupení pohledávek (balíček 3 dokumentů)",
    description:
      "Smlouva o postoupení + Vedlejší ujednání o úplatě + Oznámení dlužníkovi. Generuje se jako jediný PDF.",
  },
};

export function isContractType(value: string): value is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(value);
}

// Některé typy smluv mají varianty (např. franšíza: AB s volbou A/B v textu,
// nebo B-only s pevně daným podnájmem). Variant patří k samostatné šabloně,
// uložené pod klíčem portal:contract-template:{type}:{variant}.
export const FRANCHISE_VARIANTS = ["AB", "B"] as const;
export type FranchiseVariant = (typeof FRANCHISE_VARIANTS)[number];

export const FRANCHISE_VARIANT_META: Record<
  FranchiseVariant,
  { label: string; description: string }
> = {
  AB: {
    label: "A — nájem na franšízantovi",
    description:
      "Provozovna je sjednána na franšízanta. Smlouva obsahuje volbu mezi vlastním nájmem a podnájmem.",
  },
  B: {
    label: "B — podnájem od BOServices",
    description:
      "Provozovna je sjednána na BOServices, franšízant je v podnájmu.",
  },
};

export function hasVariants(type: ContractType): type is "franchise" {
  return type === "franchise";
}

export function isBundleType(type: ContractType): type is "claim-bundle" {
  return type === "claim-bundle";
}

export function isClaimBundleSection(
  value: string,
): value is ClaimBundleSectionType {
  return (CLAIM_BUNDLE_SECTIONS as readonly string[]).includes(value);
}

export function isFranchiseVariant(value: string): value is FranchiseVariant {
  return (FRANCHISE_VARIANTS as readonly string[]).includes(value);
}

// Krátký label pro zobrazení v hláškách (např. „Přepnuto na variantu A").
// Identifikátor varianty „AB" zůstává historicky v datech, navenek se
// ale prezentuje jen jako „A".
export function franchiseVariantShort(v: FranchiseVariant): "A" | "B" {
  return v === "AB" ? "A" : "B";
}

export const DEFAULT_FRANCHISE_VARIANT: FranchiseVariant = "B";
