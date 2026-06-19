// Provize obchodníků (dashboard + stránka /portal/commissions).
//
// Pravidla (zadání):
//   - Franšízingová smlouva: 20 000 Kč za každou PODEPSANOU franšízu
//     (type==="franchise" && clientSignedAt) - stejný gate jako milník na dashboardu.
//   - Postoupení pohledávek (type==="claim-bundle"): 0,1 % z částky (vč. DPH) za
//     KAŽDÉ uplatnění u 3 klíčových firem (BBI / TD1 / Flowers) - jak když je
//     jedna z nich DLUŽNÍKEM, tak za KAŽDÉ potvrzené ručení jednou z nich
//     (nezávisle na dlužníkovi). Tedy stejná logika uplatnění jako dlaždice
//     "Postoupené pohledávky", jen omezená na 3 firmy. Ručení == dlužník a
//     duplicitní ručitelé se neřeší - to už ošetřuje forEachContractClaimApplication.
//     NEpočítají se ruční pohledávky ani zrcadlené z Clamory (externí).
//   - Obchodník je přiřazen ke SMLOUVĚ; provize z té smlouvy se dělí rovným dílem
//     mezi přiřazené obchodníky (share = 1/n, n ∈ {1,2}).
//
// Čísla se drží přesná; zaokrouhlení až při zobrazení (formatCzkRounded).

import type { Contract, ContractStatus } from "./contracts-db";
import type { ClaimsOverlay } from "./claims-overlay";
import { forEachContractClaimApplication, isKeyCompany } from "./assigned-claims";

export type SalespersonId = "toman" | "ebermann";

export interface Salesperson {
  id: SalespersonId;
  name: string;
}

// Pevný seznam obchodníků. Rozšíření = přidat řádek (a id do isSalespersonId).
export const SALESPEOPLE: readonly Salesperson[] = [
  { id: "toman", name: "Toman" },
  { id: "ebermann", name: "Ebermann" },
] as const;

export const FRANCHISE_COMMISSION_CZK = 20_000;
export const CLAIM_COMMISSION_RATE = 0.001; // 0,1 % z částky vč. DPH

export function isSalespersonId(v: string): v is SalespersonId {
  return SALESPEOPLE.some((s) => s.id === v);
}

export function salespersonName(id: string): string {
  return SALESPEOPLE.find((s) => s.id === id)?.name ?? id;
}

// Očistí libovolný vstup na validní pole id: jen známá id, bez duplicit, max 2.
export function normalizeSalespeople(
  input: readonly string[] | undefined,
): SalespersonId[] {
  if (!input) return [];
  const out: SalespersonId[] = [];
  for (const v of input) {
    if (isSalespersonId(v) && !out.includes(v)) out.push(v);
    if (out.length >= 2) break;
  }
  return out;
}

export interface SalespersonCommission {
  id: SalespersonId;
  name: string;
  franchiseCount: number; // počet podepsaných franšíz, na kterých figuruje
  franchiseCommission: number;
  claimContractsCount: number; // počet postoupení s nenulovou provizí, na kterých figuruje
  claimCommission: number;
  total: number;
}

export interface UnassignedCommission {
  franchiseCount: number;
  franchiseCommission: number;
  claimContractsCount: number;
  claimCommission: number;
  total: number;
  contractIds: string[];
}

// Per-smlouva řádek pro přiřazovací tabulku.
export interface CommissionContractRow {
  id: string;
  type: "franchise" | "claim-bundle";
  clientName: string;
  number?: string;
  status: ContractStatus;
  signed: boolean; // splňuje gate pro provizi?
  signedAt?: string;
  debtor?: string; // jen claim-bundle
  commission: number; // provize CELÉ smlouvy (před dělením); 0 pokud nesplňuje gate / žádné klíčové uplatnění
  salespeople: SalespersonId[];
}

export interface CommissionsView {
  total: number; // součet provizí PŘIŘAZENÝCH obchodníků (bez nepřiřazených)
  franchiseTotal: number;
  claimTotal: number;
  bySalesperson: SalespersonCommission[];
  unassigned: UnassignedCommission;
  contracts: CommissionContractRow[]; // všechny franchise + claim-bundle (i nepodepsané)
}

export function buildCommissionsView(
  contracts: Contract[],
  overlay: ClaimsOverlay,
): CommissionsView {
  const acc = new Map<SalespersonId, SalespersonCommission>();
  for (const s of SALESPEOPLE) {
    acc.set(s.id, {
      id: s.id,
      name: s.name,
      franchiseCount: 0,
      franchiseCommission: 0,
      claimContractsCount: 0,
      claimCommission: 0,
      total: 0,
    });
  }
  const unassigned: UnassignedCommission = {
    franchiseCount: 0,
    franchiseCommission: 0,
    claimContractsCount: 0,
    claimCommission: 0,
    total: 0,
    contractIds: [],
  };

  // Provizní base za claim-bundle smlouvu = Σ částek uplatnění u klíčových firem
  // (dlužník je klíčová firma + každý klíčový potvrzený ručitel). Sdílený
  // iterátor zaručí stejný gate / claimKey / dedup jako dlaždice.
  const claimBaseByContract = new Map<string, number>();
  forEachContractClaimApplication(contracts, overlay, (app) => {
    let base = 0;
    if (isKeyCompany(app.debtor)) base += app.amount;
    for (const g of app.guarantors) {
      if (isKeyCompany(g)) base += app.amount;
    }
    if (base > 0) {
      claimBaseByContract.set(
        app.contractId,
        (claimBaseByContract.get(app.contractId) ?? 0) + base,
      );
    }
  });

  // Rozdělí provizi smlouvy mezi její obchodníky (share 1/n), nebo do nepřiřazeno.
  function distribute(
    contractId: string,
    commission: number,
    sps: SalespersonId[],
    kind: "franchise" | "claim",
  ): void {
    if (sps.length === 0) {
      if (kind === "franchise") {
        unassigned.franchiseCount++;
        unassigned.franchiseCommission += commission;
      } else {
        unassigned.claimContractsCount++;
        unassigned.claimCommission += commission;
      }
      unassigned.total += commission;
      unassigned.contractIds.push(contractId);
      return;
    }
    const share = commission / sps.length;
    for (const id of sps) {
      const a = acc.get(id)!;
      if (kind === "franchise") {
        a.franchiseCount++;
        a.franchiseCommission += share;
      } else {
        a.claimContractsCount++;
        a.claimCommission += share;
      }
      a.total += share;
    }
  }

  const rows: CommissionContractRow[] = [];
  for (const c of contracts) {
    if (c.type === "franchise") {
      const signed = !!c.clientSignedAt;
      const commission = signed ? FRANCHISE_COMMISSION_CZK : 0;
      const sps = normalizeSalespeople(c.salespeople);
      rows.push({
        id: c.id,
        type: "franchise",
        clientName: c.clientName,
        number: c.number,
        status: c.status,
        signed,
        signedAt: c.clientSignedAt,
        commission,
        salespeople: sps,
      });
      if (commission > 0) distribute(c.id, commission, sps, "franchise");
    } else if (c.type === "claim-bundle") {
      const signed = !!(c.clientSignedAt || c.signedAt || c.scanUploadedAt);
      const base = claimBaseByContract.get(c.id) ?? 0; // jen podepsané mají base
      const commission = base * CLAIM_COMMISSION_RATE;
      const sps = normalizeSalespeople(c.salespeople);
      rows.push({
        id: c.id,
        type: "claim-bundle",
        clientName: c.clientName,
        number: c.number,
        status: c.status,
        signed,
        signedAt: c.clientSignedAt ?? c.signedAt ?? c.scanUploadedAt,
        debtor: c.variables?.debtorName?.trim() || undefined,
        commission,
        salespeople: sps,
      });
      if (commission > 0) distribute(c.id, commission, sps, "claim");
    }
  }

  const bySalesperson = SALESPEOPLE.map((s) => acc.get(s.id)!);
  const franchiseTotal = bySalesperson.reduce(
    (sum, s) => sum + s.franchiseCommission,
    0,
  );
  const claimTotal = bySalesperson.reduce(
    (sum, s) => sum + s.claimCommission,
    0,
  );

  return {
    total: franchiseTotal + claimTotal,
    franchiseTotal,
    claimTotal,
    bySalesperson,
    unassigned,
    contracts: rows,
  };
}
