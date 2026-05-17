export const CONTRACT_TYPES = [
  "franchise",
  "cooperation",
  "operation",
  "claim-assignment",
  "side-fee",
  "assignment-notice",
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

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
};

export function isContractType(value: string): value is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(value);
}
