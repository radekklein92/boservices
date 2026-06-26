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
  // Smlouva, na kterou ikonka odkazuje (chybí u čistě naplánovaného slotu).
  contractId?: string;
};

// Minimální tvar smlouvy, který potřebujeme pro výpočet stavu.
export type ContractLite = {
  id: string;
  type: ContractType;
  clientSignedAt?: string;
  // DigiSign mezistav: klient už podepsal, ale obálka ještě nedoběhla (druhá
  // strana dosud nepodepsala) - počítáme ho jako „podepsáno klientem".
  digisignClientSignedAt?: string;
  scanUploadedAt?: string;
  createdAt?: string;
};

const STATE_RANK: Record<ContractTypeState, number> = {
  planned: 0,
  "in-progress": 1,
  signed: 2,
  archived: 3,
};

// Sub-typy postoupení (i samostatné legacy) se zobrazují jako jeden typ
// „Postoupení pohledávek" (claim-bundle).
function displayType(t: ContractType): ContractType {
  if (t === "claim-assignment" || t === "side-fee" || t === "assignment-notice") {
    return "claim-bundle";
  }
  return t;
}

function contractState(c: ContractLite): Exclude<ContractTypeState, "planned"> {
  if (c.scanUploadedAt) return "archived";
  // Podepsáno klientem vč. DigiSign mezistavu (klient podepsal, čeká se na druhou
  // stranu) - sjednoceno s počítadly na dashboardu (clientSignedAtEffective).
  if (c.clientSignedAt || c.digisignClientSignedAt) return "signed";
  return "in-progress";
}

// Plán smluv může být uložen jako count-mapa (nově) nebo pole typů (legacy).
// Vrací mapu typ -> počet (jen kladné počty).
export function normalizePlanned(
  value: unknown,
): Partial<Record<ContractType, number>> {
  const out: Partial<Record<ContractType, number>> = {};
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const t of value) {
      if (typeof t === "string") {
        out[t as ContractType] = (out[t as ContractType] ?? 0) + 1;
      }
    }
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n) && n > 0) out[k as ContractType] = n;
    }
  }
  return out;
}

// Spočítá ikonky pro klienta. Pro každý typ vytvoří „sloty" = max(plánovaný
// počet, počet existujících smluv). Sloty se obsazují existujícími smlouvami
// (od nejvyššího stavu), zbylé jsou „naplánováno". Každý obsazený slot odkazuje
// na konkrétní smlouvu. Řazeno dle pořadí typů.
export function clientContractBadges(
  planned: unknown,
  contracts: ContractLite[],
): ClientContractBadge[] {
  const plannedMap = normalizePlanned(planned);
  const result: ClientContractBadge[] = [];

  for (const type of CONTRACT_TYPES_PICKABLE) {
    const plannedCount = plannedMap[type] ?? 0;
    const cs = contracts
      .filter((c) => displayType(c.type) === type)
      .map((c) => ({
        state: contractState(c),
        id: c.id,
        createdAt: c.createdAt ?? "",
      }))
      .sort(
        (a, b) =>
          STATE_RANK[b.state] - STATE_RANK[a.state] ||
          b.createdAt.localeCompare(a.createdAt),
      );

    const slots = Math.max(plannedCount, cs.length);
    for (let i = 0; i < slots; i++) {
      const c = cs[i];
      if (c) {
        result.push({ type, state: c.state, contractId: c.id });
      } else {
        result.push({ type, state: "planned" });
      }
    }
  }

  return result;
}
