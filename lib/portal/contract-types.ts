export const CONTRACT_TYPES = [
  "franchise",
  "cooperation",
  "operation",
  "claim-bundle",
  "withdrawal",
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
  "withdrawal",
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
    fullName: "Postoupení pohledávek",
    description:
      "Smlouva o postoupení + Vedlejší ujednání o úplatě + Oznámení dlužníkovi.",
  },
  withdrawal: {
    key: "withdrawal",
    shortName: "Odstoupení od smluv",
    fullName: "Odstoupení od smluv",
    description: "Klient odstupuje od MS a FS, volitelně i od KS.",
  },
};

export function isContractType(value: string): value is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(value);
}

// Některé typy smluv mají varianty (např. franšíza: AB s volbou A/B v textu,
// nebo B-only s pevně daným podnájmem; odstoupení: A porušení Manažera nebo
// B porušení Poskytovatele). Variant patří k samostatné šabloně, uložené
// pod klíčem portal:contract-template:{type}:{variant}.
export const FRANCHISE_VARIANTS = ["AB", "B"] as const;
export type FranchiseVariant = (typeof FRANCHISE_VARIANTS)[number];

// A/B = jednostranné Odstoupení (A porušení Manažera, B porušení Poskytovatele).
// D = dvoustranná Dohoda o ukončení smluv (vychází ze stejného porušení jako B).
export const WITHDRAWAL_VARIANTS = ["A", "B", "D"] as const;
export type WithdrawalVariant = (typeof WITHDRAWAL_VARIANTS)[number];

// Dohoda o ukončení (varianta D) - dvoustranná, na rozdíl od jednostranného
// odstoupení (A/B). Řídí cover, podpisový flow i podpisové bloky.
export function isWithdrawalAgreement(variant?: string): boolean {
  return variant === "D";
}

// Sjednocený typ - každý Contract.variant je textový identifikátor, jehož
// platné hodnoty určuje typ smlouvy.
export type ContractVariant = FranchiseVariant | WithdrawalVariant;

export interface VariantMeta {
  label: string;
  description: string;
}

export const FRANCHISE_VARIANT_META: Record<FranchiseVariant, VariantMeta> = {
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

export const WITHDRAWAL_VARIANT_META: Record<WithdrawalVariant, VariantMeta> = {
  A: {
    label: "Odstoupení — porušení Manažera",
    description: "Jednostranné odstoupení od MS (FS padá § 1727). Při aktivní manažerské smlouvě.",
  },
  B: {
    label: "Odstoupení — porušení Poskytovatele",
    description: "Jednostranné odstoupení od FS (MS padá § 1727). Pokud TWIST přišel o místo.",
  },
  D: {
    label: "Dohoda o ukončení — porušení Poskytovatele",
    description: "Dvoustranná dohoda o ukončení FS a navázaných smluv. Podepisují obě strany.",
  },
};

export function hasVariants(
  type: ContractType,
): type is "franchise" | "withdrawal" {
  return type === "franchise" || type === "withdrawal";
}

export function isBundleType(type: ContractType): type is "claim-bundle" {
  return type === "claim-bundle";
}

// Typy, které se před podpisem posuzují podle lokality (kategorie + nájem +
// nový režim) a procházejí stavem „Ke schválení". Klíč k automatickému
// schválení i samotný gate řeší lib/portal/contract-approval.ts.
export const APPROVAL_GATED_TYPES: ReadonlySet<ContractType> = new Set([
  "franchise",
  "cooperation",
  "operation",
]);

export function isApprovalGated(type: ContractType): boolean {
  return APPROVAL_GATED_TYPES.has(type);
}

// Jednostranné smlouvy/prohlášení - BOS na nich nepodepisuje, šablona má
// jen podpis klienta. Flow se proto zkracuje: Koncept → Schváleno →
// Podepsáno klientem → Archivováno (skipuje se "K podpisu" a "Podepsáno BOS",
// které jsou specifické pro výběr podepisujícího za BOS).
const UNILATERAL_TYPES: Set<ContractType> = new Set([
  "withdrawal",
  "assignment-notice",
]);

export function isUnilateralContract(type: ContractType): boolean {
  return UNILATERAL_TYPES.has(type);
}

export function isClaimBundleSection(
  value: string,
): value is ClaimBundleSectionType {
  return (CLAIM_BUNDLE_SECTIONS as readonly string[]).includes(value);
}

export function isFranchiseVariant(value: string): value is FranchiseVariant {
  return (FRANCHISE_VARIANTS as readonly string[]).includes(value);
}

export function isWithdrawalVariant(
  value: string,
): value is WithdrawalVariant {
  return (WITHDRAWAL_VARIANTS as readonly string[]).includes(value);
}

// Vrátí pole platných variant pro daný typ smlouvy (prázdné pole pro typy
// bez variant). Generický helper - používá ho UI variant switcher.
export function getVariantsForType(type: ContractType): readonly string[] {
  if (type === "franchise") return FRANCHISE_VARIANTS;
  if (type === "withdrawal") return WITHDRAWAL_VARIANTS;
  return [];
}

// Vrátí meta info (label, description) pro variantu daného typu.
export function getVariantMeta(
  type: ContractType,
  variant: string,
): VariantMeta | null {
  if (type === "franchise" && isFranchiseVariant(variant)) {
    return FRANCHISE_VARIANT_META[variant];
  }
  if (type === "withdrawal" && isWithdrawalVariant(variant)) {
    return WITHDRAWAL_VARIANT_META[variant];
  }
  return null;
}

export function isValidVariantForType(
  type: ContractType,
  variant: string,
): boolean {
  return getVariantsForType(type).includes(variant);
}

// Krátký label pro zobrazení v hláškách (např. „Přepnuto na variantu A").
// Identifikátor varianty „AB" (franšíza) zůstává historicky v datech, navenek
// se ale prezentuje jen jako „A". U withdrawal je už A/B nativně.
export function franchiseVariantShort(v: FranchiseVariant): "A" | "B" {
  return v === "AB" ? "A" : "B";
}

export function variantShortLabel(
  type: ContractType,
  variant: string,
): string {
  if (type === "franchise" && isFranchiseVariant(variant)) {
    return franchiseVariantShort(variant);
  }
  return variant;
}

export const DEFAULT_FRANCHISE_VARIANT: FranchiseVariant = "B";
export const DEFAULT_WITHDRAWAL_VARIANT: WithdrawalVariant = "A";

export function getDefaultVariantForType(type: ContractType): string | undefined {
  if (type === "franchise") return DEFAULT_FRANCHISE_VARIANT;
  if (type === "withdrawal") return DEFAULT_WITHDRAWAL_VARIANT;
  return undefined;
}
