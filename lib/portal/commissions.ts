// Provize obchodníků (dashboard + stránka /portal/commissions).
//
// Pravidla (zadání): provize jsou VŽDY 50:50 mezi oba obchodníky (Toman,
// Ebermann). Není třeba označovat, kdo smlouvu dojednal - nárok mají vždy oba
// děleno 2. Proto se ke smlouvám nic nepřiřazuje; každá podepsaná franšíza
// (20 000 Kč) i každé kvalifikující uplatnění pohledávky (0,1 %) se rozdělí napůl.
//   - Franšíza: 20 000 Kč za každou PODEPSANOU franšízu (clientSignedAt).
//   - Postoupení (claim-bundle): 0,1 % z částky (vč. DPH) za KAŽDÉ uplatnění u 3
//     klíčových firem (BBI/TD1/Flowers) - dlužník i každé potvrzené ručení jednou
//     z nich. Logika uplatnění shodná s dlaždicí (forEachContractClaimApplication).
//     NEpočítají se ruční pohledávky ani zrcadlené z Clamory (externí).
//
// Čísla se drží přesná; zaokrouhlení až při zobrazení (formatCzkRounded).

import type { Contract, ContractStatus } from "./contracts-db";
import type { ClaimsOverlay } from "./claims-overlay";
import { forEachContractClaimApplication, isKeyCompany } from "./assigned-claims";

export type SalespersonId = "toman" | "ebermann";

export interface Salesperson {
  id: SalespersonId;
  name: string;
  email: string; // přihlášení do portálu - mapuje payouty + viditelnost na uživatele
}

export const SALESPEOPLE: readonly Salesperson[] = [
  { id: "toman", name: "Toman", email: "stanislav.toman@boservices.cz" },
  { id: "ebermann", name: "Ebermann", email: "krystof.ebermann@boservices.cz" },
] as const;

export const FRANCHISE_COMMISSION_CZK = 20_000;
export const CLAIM_COMMISSION_RATE = 0.001; // 0,1 % z částky vč. DPH

export function salespersonName(id: string): string {
  return SALESPEOPLE.find((s) => s.id === id)?.name ?? id;
}

export function isSalespersonId(v: string): v is SalespersonId {
  return SALESPEOPLE.some((s) => s.id === v);
}

// Přihlášený uživatel je jeden z obchodníků? (match dle e-mailu, case-insensitive)
export function isSalespersonEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return SALESPEOPLE.some((s) => s.email.toLowerCase() === e);
}

export function salespersonByEmail(
  email: string | undefined | null,
): Salesperson | undefined {
  if (!email) return undefined;
  const e = email.toLowerCase();
  return SALESPEOPLE.find((s) => s.email.toLowerCase() === e);
}

export interface SalespersonCommission {
  id: SalespersonId;
  name: string;
  franchiseCount: number; // počet podepsaných franšíz (oba se podílejí na všech)
  franchiseCommission: number; // = franchiseTotal / 2
  claimCommission: number; // = claimTotal / 2
  total: number; // = (franchiseTotal + claimTotal) / 2
}

// Per-smlouva řádek - read-only přehled toho, co provizi tvoří.
export interface CommissionContractRow {
  id: string;
  type: "franchise" | "claim-bundle";
  clientName: string;
  number?: string;
  status: ContractStatus;
  signed: boolean;
  signedAt?: string;
  debtor?: string; // jen claim-bundle
  commission: number; // provize CELÉ smlouvy (před dělením 50:50)
}

export interface CommissionsView {
  total: number; // celková provize (plná, nedělená)
  franchiseTotal: number;
  claimTotal: number;
  franchiseCount: number; // počet podepsaných franšíz
  bySalesperson: SalespersonCommission[]; // každý = total/2
  contracts: CommissionContractRow[];
}

export function buildCommissionsView(
  contracts: Contract[],
  overlay: ClaimsOverlay,
): CommissionsView {
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

  const rows: CommissionContractRow[] = [];
  let franchiseTotal = 0;
  let claimTotal = 0;
  let franchiseCount = 0;

  for (const c of contracts) {
    if (c.type === "franchise") {
      const signed = !!c.clientSignedAt;
      const commission = signed ? FRANCHISE_COMMISSION_CZK : 0;
      if (signed) {
        franchiseTotal += commission;
        franchiseCount++;
      }
      rows.push({
        id: c.id,
        type: "franchise",
        clientName: c.clientName,
        number: c.number,
        status: c.status,
        signed,
        signedAt: c.clientSignedAt,
        commission,
      });
    } else if (c.type === "claim-bundle") {
      const signed = !!(c.clientSignedAt || c.signedAt || c.scanUploadedAt);
      const base = claimBaseByContract.get(c.id) ?? 0; // jen podepsané mají base
      const commission = base * CLAIM_COMMISSION_RATE;
      claimTotal += commission;
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
      });
    }
  }

  const total = franchiseTotal + claimTotal;
  const bySalesperson: SalespersonCommission[] = SALESPEOPLE.map((s) => ({
    id: s.id,
    name: s.name,
    franchiseCount,
    franchiseCommission: franchiseTotal / 2,
    claimCommission: claimTotal / 2,
    total: total / 2,
  }));

  return {
    total,
    franchiseTotal,
    claimTotal,
    franchiseCount,
    bySalesperson,
    contracts: rows,
  };
}
