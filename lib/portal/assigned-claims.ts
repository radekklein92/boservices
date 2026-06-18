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
import {
  parseClaimAmount,
  claimLegalTitle,
  claimOriginLabel,
  CLAIM_ORIGIN_OPTIONS,
} from "./claims";
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

// Reference na smluvní pohledávku pro editor cross-ručení - s plným kontextem
// (vše, co se u pohledávky vyplňuje), aby uživatel věděl, ke které pohledávce
// ručitele přidává.
export interface ContractClaimRef {
  id: string;
  title: string; // právní titul
  amount: number;
  debtor: string; // dlužník (variables.debtorName)
  contractId: string;
  client?: string; // postupitel (clientName)
  contractNumber?: string;
  contractDate?: string;
  originLabel?: string; // "Kupní smlouva ze dne …"
  invoiceNumber?: string;
  dueDate?: string;
  note?: string;
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

// Normalizace názvu firmy pro porovnání duplicit: malá písmena, bez právní
// formy (s.r.o./a.s./spol.) a interpunkce. "Flowers International s.r.o." a
// "Flowers International" → stejný klíč. NEMĚNÍ uloženou hodnotu, jen dedup
// nabídky pickeru.
function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bspol\.?\s*s\.?\s*r\.?\s*o\.?/g, "")
    .replace(/\bs\.?\s*r\.?\s*o\.?/g, "")
    .replace(/\ba\.\s*s\.?/g, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Sestaví nabídku firem do pickeru bez duplicit. Pořadí vstupu rozhoduje, která
// varianta zůstane - volajícímu stačí dát napřed plné názvy z breakdownu (přesné
// stringy = klíče agregace), pak krátké presety; krátká varianta se zahodí,
// pokud už stejný subjekt v seznamu je.
export function dedupeCompanyOptions(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const trimmed = n.trim();
    if (!trimmed) continue;
    const norm = normalizeCompany(trimmed);
    const key = norm || trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

// Čistý popis "vznikla ze smlouvy" bez dovětku "uzavřená mezi Dlužníkem a
// Postupitelem" (ten je vhodný do PDF tabulky, ne do přehledu).
function originDisplay(item: ClaimItem): string {
  const base =
    item.origin === "jina"
      ? item.originOther?.trim() || "Jiná smlouva"
      : CLAIM_ORIGIN_OPTIONS.find((o) => o.value === item.origin)?.label ??
        "Jiná smlouva";
  const date = item.originDate?.trim();
  return date ? `${base} ze dne ${date}` : base;
}

// Plochý seznam smluvních pohledávek pro editor cross-ručení - s plným
// kontextem. Gate a odvození claimKey MUSÍ být shodné s buildAssignedClaimsView,
// aby se ručitelé navázali na stejné klíče.
export function buildContractClaimRefs(contracts: Contract[]): ContractClaimRef[] {
  const out: ContractClaimRef[] = [];
  for (const c of contracts) {
    if (c.type !== "claim-bundle") continue;
    if (!(c.clientSignedAt || c.signedAt || c.scanUploadedAt)) continue;
    const debtor = c.variables?.debtorName?.trim() || UNNAMED_DEBTOR;
    const claims = c.claims ?? [];
    for (let index = 0; index < claims.length; index++) {
      const item = claims[index]!;
      const amt = parseClaimAmount(item.amount);
      if (amt <= 0) continue;
      out.push({
        id: item.id || `${c.id}#${index}`,
        contractId: c.id,
        debtor,
        amount: amt,
        title: titleForClaimItem(item),
        client: c.clientName?.trim() || undefined,
        contractNumber: c.number?.trim() || undefined,
        contractDate: c.variables?.contractDate?.trim() || undefined,
        originLabel: originDisplay(item),
        invoiceNumber: item.invoiceNumber?.trim() || undefined,
        dueDate: item.dueDate?.trim() || undefined,
        note: item.note?.trim() || undefined,
      });
    }
  }
  return out;
}
