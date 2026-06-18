// Agregace dlaždice "Postoupené pohledávky" (dashboard). Sloučí smluvní
// pohledávky (z claim-bundle smluv) s overlay vrstvou (ruční pohledávky +
// cross-ručení) do jednoho přehledu.
//
// Headline = SOUČET VŠECH UPLATNĚNÍ: pohledávka se započítá u primárního
// dlužníka i u každého potvrzeného ručitele plnou částkou. Z konstrukce platí
// invariant: SUM(breakdown.total) === view.total (headline) - headline roste
// jen tam, kde roste total konkrétní firmy.

import type { Contract } from "./contracts-db";
import type { ClaimItem } from "./claims";
import { parseClaimAmount, claimLegalTitle, claimOriginLabel } from "./claims";
import type { ClaimsOverlay } from "./claims-overlay";
import { confirmedGuarantors, dedupeByCompany } from "./claims-overlay";

const UNNAMED_DEBTOR = "Neuvedený dlužník";

// Plochá pohledávka pro drill-down v modalu i pro editor cross-ručení.
export interface AssignedClaimRow {
  id: string; // smluvní: ClaimItem.id || `${contractId}#${index}`; ruční: ManualClaim.id
  source: "contract" | "manual";
  contractId?: string;
  debtorName: string; // primární dlužník
  title: string;
  amount: number; // vč. DPH
  guarantors: string[]; // jen potvrzení ručitelé (názvy firem)
}

export interface AssignedClaimsCompanyRow {
  name: string;
  total: number; // součet uplatnění na firmu (primární + ručení)
  claimsCount: number; // počet pohledávek, kde firma figuruje (dlužník nebo ručitel)
  asPrimaryTotal: number;
  asGuarantorTotal: number;
  contractsCount: number;
}

export interface AssignedClaimsView {
  total: number; // HEADLINE
  contractsCount: number; // počet claim-bundle smluv v součtu
  manualClaimsCount: number;
  breakdown: AssignedClaimsCompanyRow[]; // desc dle total; SUM(total) === total
  rows: AssignedClaimRow[];
}

// Odlehčená reference na smluvní pohledávku pro editor cross-ručení (klient).
export interface ContractClaimRef {
  id: string;
  title: string;
  amount: number;
  debtor: string;
  contractId: string;
}

// Název smluvní pohledávky (ClaimItem nemá pole "name") - z právního titulu,
// fallback na popis původu, fallback na obecné "Pohledávka".
export function titleForClaimItem(item: ClaimItem): string {
  const legal = claimLegalTitle(item).trim();
  if (legal) return legal;
  const origin = claimOriginLabel(item).trim();
  if (origin) return origin;
  return "Pohledávka";
}

type CompanyAccumulator = AssignedClaimsCompanyRow & {
  _claimKeys: Set<string>;
  _contractKeys: Set<string>;
};

export function buildAssignedClaimsView(
  contracts: Contract[],
  overlay: ClaimsOverlay,
): AssignedClaimsView {
  const companyMap = new Map<string, CompanyAccumulator>();
  const rows: AssignedClaimRow[] = [];
  let headline = 0;
  let contractsCount = 0;
  let manualClaimsCount = 0;

  function ensure(name: string): CompanyAccumulator {
    let e = companyMap.get(name);
    if (!e) {
      e = {
        name,
        total: 0,
        claimsCount: 0,
        asPrimaryTotal: 0,
        asGuarantorTotal: 0,
        contractsCount: 0,
        _claimKeys: new Set(),
        _contractKeys: new Set(),
      };
      companyMap.set(name, e);
    }
    return e;
  }

  // Jediná cesta, kde se mění total firmy I headline -> drží invariant.
  function apply(
    rawName: string,
    amount: number,
    role: "primary" | "guarantor",
    claimKey: string,
    contractId?: string,
  ): void {
    const name = rawName.trim() || UNNAMED_DEBTOR;
    const e = ensure(name);
    e.total += amount;
    headline += amount;
    if (role === "primary") e.asPrimaryTotal += amount;
    else e.asGuarantorTotal += amount;
    if (!e._claimKeys.has(claimKey)) {
      e._claimKeys.add(claimKey);
      e.claimsCount++;
    }
    if (contractId && !e._contractKeys.has(contractId)) {
      e._contractKeys.add(contractId);
      e.contractsCount++;
    }
  }

  // 1) Smluvní pohledávky z claim-bundle smluv (zachovaný gate z dashboardu).
  for (const c of contracts) {
    if (c.type !== "claim-bundle") continue;
    if (!(c.clientSignedAt || c.signedAt || c.scanUploadedAt)) continue;
    contractsCount++;
    const debtor = c.variables?.debtorName?.trim() || UNNAMED_DEBTOR;
    const claims = c.claims ?? [];
    for (let index = 0; index < claims.length; index++) {
      const item = claims[index]!;
      const amt = parseClaimAmount(item.amount);
      if (amt <= 0) continue;
      const claimKey = item.id || `${c.id}#${index}`;
      const confGs = dedupeByCompany(
        confirmedGuarantors(overlay.guaranteesByClaimId[claimKey]),
      );
      apply(debtor, amt, "primary", claimKey, c.id);
      const guarantorNames: string[] = [];
      for (const g of confGs) {
        const gName = g.company.trim();
        if (!gName || gName === debtor) continue; // ručitel == dlužník -> nezapočítat 2x
        apply(gName, amt, "guarantor", claimKey, c.id);
        guarantorNames.push(gName);
      }
      rows.push({
        id: claimKey,
        source: "contract",
        contractId: c.id,
        debtorName: debtor,
        title: titleForClaimItem(item),
        amount: amt,
        guarantors: guarantorNames,
      });
    }
  }

  // 2) Ruční pohledávky z overlay.
  for (const m of overlay.manualClaims) {
    const amt = parseClaimAmount(m.amount);
    if (amt <= 0 || !m.name.trim()) continue;
    manualClaimsCount++;
    const primary = m.primaryDebtor.trim() || UNNAMED_DEBTOR;
    const confGs = dedupeByCompany(confirmedGuarantors(m.guarantors));
    apply(primary, amt, "primary", m.id);
    const guarantorNames: string[] = [];
    for (const g of confGs) {
      const gName = g.company.trim();
      if (!gName || gName === primary) continue;
      apply(gName, amt, "guarantor", m.id);
      guarantorNames.push(gName);
    }
    rows.push({
      id: m.id,
      source: "manual",
      debtorName: primary,
      title: m.name.trim(),
      amount: amt,
      guarantors: guarantorNames,
    });
  }

  const breakdown: AssignedClaimsCompanyRow[] = [...companyMap.values()]
    .map(({ _claimKeys, _contractKeys, ...rest }) => {
      void _claimKeys;
      void _contractKeys;
      return rest;
    })
    .sort((a, b) => b.total - a.total);

  return { total: headline, contractsCount, manualClaimsCount, breakdown, rows };
}
