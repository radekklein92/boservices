import {
  CONTRACT_TYPES_PICKABLE,
  type ContractType,
} from "./contract-types";

// Stav typu smlouvy u klienta pro barevné ikonky na přehledu.
export type ContractTypeState =
  | "planned" // naplánováno, žádná smlouva nevytvořena
  | "in-progress" // smlouva existuje, není podepsaná klientem
  | "signed" // podepsáno klientem (clientSignedAt)
  | "archived"; // archivováno (nahraný sken)

export type ClientContractBadge = {
  type: ContractType;
  state: ContractTypeState;
};

// Minimální tvar smlouvy, který potřebujeme pro výpočet stavu.
export type ContractLite = {
  type: ContractType;
  clientSignedAt?: string;
  scanUploadedAt?: string;
};

const STATE_RANK: Record<ContractTypeState, number> = {
  planned: 0,
  "in-progress": 1,
  signed: 2,
  archived: 3,
};

// Sub-typy postoupení (i samostatné legacy) se na přehledu zobrazují jako
// jeden typ „Postoupení pohledávek" (claim-bundle).
function displayType(t: ContractType): ContractType {
  if (t === "claim-assignment" || t === "side-fee" || t === "assignment-notice") {
    return "claim-bundle";
  }
  return t;
}

function contractState(c: ContractLite): Exclude<ContractTypeState, "planned"> {
  if (c.scanUploadedAt) return "archived";
  if (c.clientSignedAt) return "signed";
  return "in-progress";
}

// Spočítá ikonky pro klienta: pro každý relevantní typ (naplánovaný ∪ existující)
// vrátí nejvyšší dosažený stav přes jeho smlouvy. Řazeno dle pořadí typů.
export function clientContractBadges(
  plannedContracts: ContractType[] | undefined,
  contracts: ContractLite[],
): ClientContractBadge[] {
  const byType = new Map<ContractType, ContractTypeState>();

  for (const t of plannedContracts ?? []) {
    byType.set(displayType(t), "planned");
  }
  for (const c of contracts) {
    const t = displayType(c.type);
    const s = contractState(c);
    const cur = byType.get(t);
    if (cur === undefined || STATE_RANK[s] > STATE_RANK[cur]) {
      byType.set(t, s);
    }
  }

  return CONTRACT_TYPES_PICKABLE.filter((t) => byType.has(t)).map((t) => ({
    type: t,
    state: byType.get(t)!,
  }));
}
