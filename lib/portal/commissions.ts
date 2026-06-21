// Provize obchodníků (dashboard + stránka /portal/commissions).
//
// Pravidla (zadání): provize jsou VŽDY 50:50 mezi oba obchodníky (Toman,
// Ebermann). Není třeba označovat, kdo dojednal - nárok mají vždy oba děleno 2.
//   - "Smluvní" provize (franšíza / spolupráce / provozování) - DATEM ŘÍZENO
//     podle clientSignedAt (viz contractCommission):
//       * STARÉ pravidlo (podpis < 20.6.2026): každá z těch tří smluv = 10 000 Kč.
//       * NOVÉ pravidlo (podpis >= 20.6.2026): počítá se JEN franšíza - 20 000 Kč
//         pokud na její lokalitě NENÍ podepsaná spolupráce/provozování, jinak
//         10 000 Kč. Spolupráce/provozování pod novým pravidlem samostatně 0 Kč.
//   - Postoupení (claim-bundle) u 3 klíčových firem (BBI/TD1/Flowers): za DLUŽNÍKA
//     0,1 % z částky (vč. DPH), za každé potvrzené RUČENÍ jednou z nich jen 0,05 %
//     (poloviční). Lze i obojí u jedné pohledávky. Logika uplatnění shodná s
//     dlaždicí (forEachContractClaimApplication). NEpočítají se ruční pohledávky
//     ani zrcadlené z Clamory (externí).
//
// Vždy 50:50 mezi oba obchodníky. Čísla přesná, zaokrouhlení až při zobrazení.

import type { Contract } from "./contracts-db";
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

export const CONTRACT_COMMISSION_CZK = 10_000;
export const FRANCHISE_SOLO_COMMISSION_CZK = 20_000; // nové pravidlo: franšíza bez doprovodné
export const CLAIM_COMMISSION_RATE = 0.001; // 0,1 % z částky vč. DPH (dlužník)
export const CLAIM_GUARANTEE_RATE = 0.0005; // 0,05 % za ručení (poloviční)

// Od tohoto okamžiku (dle clientSignedAt) platí nové pravidlo u smluvní provize.
export const NEW_RULES_FROM = "2026-06-20T00:00:00.000Z";

// Provize CELÉ smlouvy (před dělením 50:50). 0 = nezakládá provizi.
// accompaniedLocations = lokality s podepsanou spoluprací/provozováním.
function contractCommission(
  c: Contract,
  accompaniedLocations: ReadonlySet<string>,
): number {
  if (c.cancelledAt) return 0; // zrušená smlouva provizi nezakládá
  if (!c.clientSignedAt) return 0;
  const isNew = c.clientSignedAt >= NEW_RULES_FROM;
  if (c.type === "franchise") {
    if (!isNew) return CONTRACT_COMMISSION_CZK;
    const accompanied = !!c.locationId && accompaniedLocations.has(c.locationId);
    return accompanied ? CONTRACT_COMMISSION_CZK : FRANCHISE_SOLO_COMMISSION_CZK;
  }
  if (c.type === "cooperation" || c.type === "operation") {
    // Pod novým pravidlem samostatně neplatí (počítá se jen franšíza).
    return isNew ? 0 : CONTRACT_COMMISSION_CZK;
  }
  return 0;
}

// Rozpad provize z pohledávek per smlouva (kvůli přesné poznámce v rozpisu).
interface ClaimAccum {
  total: number;
  debtorFee: number; // 0,1 % za dlužníka (klíčovou firmu)
  guaranteeFee: number; // 0,05 % za každé klíčové ručení
  guaranteeCount: number; // počet klíčových potvrzených ručení
}

// Lidská poznámka k řádku pohledávky - rozliší dlužníka (0,1 %) a ručení
// (0,05 %), aby bylo z rozpisu jasné, že se sazby liší. Volá se jen u řádků,
// kde provize > 0 (tj. aspoň jedna část je nenulová).
function claimNote(acc: ClaimAccum): string {
  const parts: string[] = [];
  if (acc.debtorFee > 0) parts.push("0,1 % za dlužníka");
  if (acc.guaranteeCount > 0) {
    parts.push(`0,05 % za ručení (${acc.guaranteeCount}x)`);
  }
  return parts.join(" + ");
}

export function salespersonName(id: string): string {
  return SALESPEOPLE.find((s) => s.id === id)?.name ?? id;
}

export function salespersonEmailById(id: string): string | undefined {
  return SALESPEOPLE.find((s) => s.id === id)?.email;
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
  contractsCount: number; // počet podepsaných smluv (franšíza/spolupráce/provozování)
  contractsCommission: number; // = contractsTotal / 2
  claimCommission: number; // = claimTotal / 2
  total: number; // = (contractsTotal + claimTotal) / 2
}

// Jeden řádek rozpisu - co konkrétně provizi tvoří (celá částka před 50:50).
export interface CommissionRow {
  id: string;
  kind: "contract" | "claim"; // smluvní provize vs. postoupení pohledávek (pro filtr)
  label: string; // "Franšíza" | "Spolupráce" | "Provozování" | "Postoupení pohledávek"
  clientName: string;
  number?: string;
  signedAt?: string;
  commission: number; // provize CELÉ smlouvy (před dělením 50:50)
  note?: string; // "samostatná franšíza" | "0,1 % za dlužníka + 0,05 % za ručení (2x)" ...
}

export interface CommissionsView {
  total: number; // celková provize (plná, nedělená)
  contractsTotal: number;
  claimTotal: number;
  contractsCount: number; // počet podepsaných smluv (franšíza/spolupráce/provozování)
  bySalesperson: SalespersonCommission[]; // každý = total/2
  rows: CommissionRow[]; // rozpis jednotlivých provizí (jen položky s provizí > 0)
}

export function buildCommissionsView(
  contracts: Contract[],
  overlay: ClaimsOverlay,
): CommissionsView {
  // Provizní base za claim-bundle smlouvu = Σ částek uplatnění u klíčových firem
  // (dlužník je klíčová firma + každý klíčový potvrzený ručitel). Sdílený
  // iterátor zaručí stejný gate / claimKey / dedup jako dlaždice.
  // Provize z pohledávek per smlouva: dlužník (klíčová firma) 0,1 %, každé
  // potvrzené ručení klíčovou firmou 0,05 %.
  // Per smlouva sledujeme rozpad: provize za dlužníka (0,1 %) a provize za
  // ručení (0,05 % za každé klíčové potvrzené ručení) + počet ručení - kvůli
  // přesné poznámce v rozpisu.
  const claimCommissionByContract = new Map<string, ClaimAccum>();
  forEachContractClaimApplication(contracts, overlay, (app) => {
    let debtorFee = 0;
    let guaranteeFee = 0;
    let guaranteeCount = 0;
    if (isKeyCompany(app.debtor)) debtorFee += app.amount * CLAIM_COMMISSION_RATE;
    for (const g of app.guarantors) {
      if (isKeyCompany(g)) {
        guaranteeFee += app.amount * CLAIM_GUARANTEE_RATE;
        guaranteeCount += 1;
      }
    }
    if (debtorFee + guaranteeFee > 0) {
      const prev = claimCommissionByContract.get(app.contractId) ?? {
        total: 0,
        debtorFee: 0,
        guaranteeFee: 0,
        guaranteeCount: 0,
      };
      claimCommissionByContract.set(app.contractId, {
        total: prev.total + debtorFee + guaranteeFee,
        debtorFee: prev.debtorFee + debtorFee,
        guaranteeFee: prev.guaranteeFee + guaranteeFee,
        guaranteeCount: prev.guaranteeCount + guaranteeCount,
      });
    }
  });

  // Lokality s podepsanou spoluprací/provozováním (pro nové pravidlo u franšízy).
  const accompaniedLocations = new Set<string>();
  for (const c of contracts) {
    if (
      (c.type === "cooperation" || c.type === "operation") &&
      c.clientSignedAt &&
      !c.cancelledAt &&
      c.locationId
    ) {
      accompaniedLocations.add(c.locationId);
    }
  }

  const rows: CommissionRow[] = [];
  let contractsTotal = 0;
  let claimTotal = 0;
  let contractsCount = 0;

  for (const c of contracts) {
    if (c.type === "claim-bundle") {
      const acc = claimCommissionByContract.get(c.id); // dlužník 0,1 % + ručení 0,05 %
      const fee = acc?.total ?? 0;
      claimTotal += fee;
      if (acc && fee > 0) {
        rows.push({
          id: c.id,
          kind: "claim",
          label: "Postoupení pohledávek",
          clientName: c.clientName,
          number: c.number,
          signedAt: c.clientSignedAt ?? c.signedAt ?? c.scanUploadedAt,
          commission: fee,
          note: claimNote(acc),
        });
      }
      continue;
    }
    const fee = contractCommission(c, accompaniedLocations);
    if (fee > 0) {
      contractsTotal += fee;
      contractsCount++;
      const isNew = !!c.clientSignedAt && c.clientSignedAt >= NEW_RULES_FROM;
      const label =
        c.type === "franchise"
          ? "Franšíza"
          : c.type === "cooperation"
            ? "Spolupráce"
            : "Provozování";
      const note =
        c.type === "franchise" && isNew
          ? !!c.locationId && accompaniedLocations.has(c.locationId)
            ? "s doprovodnou smlouvou"
            : "samostatná franšíza"
          : undefined;
      rows.push({
        id: c.id,
        kind: "contract",
        label,
        clientName: c.clientName,
        number: c.number,
        signedAt: c.clientSignedAt,
        commission: fee,
        note,
      });
    }
  }

  // Nejnovější podpis první.
  rows.sort((a, b) => (b.signedAt ?? "").localeCompare(a.signedAt ?? ""));

  const total = contractsTotal + claimTotal;
  const bySalesperson: SalespersonCommission[] = SALESPEOPLE.map((s) => ({
    id: s.id,
    name: s.name,
    contractsCount,
    contractsCommission: contractsTotal / 2,
    claimCommission: claimTotal / 2,
    total: total / 2,
  }));

  return { total, contractsTotal, claimTotal, contractsCount, bySalesperson, rows };
}
