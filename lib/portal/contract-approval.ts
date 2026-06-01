import { isApprovalGated } from "./contract-types";
import { statusOrder, type Contract } from "./contracts-db";
import type {
  LeaseStatus,
  LocationCategory,
  LocationMode,
} from "./locations-db";

// ─────────────────────────────────────────────────────────────────────────────
// Schvalování smluv podle lokality. Týká se typů isApprovalGated (franšíza,
// spolupráce, provozování). Klíč k automatickému schválení:
//
//   1) Nájem na franšízanta + nový režim Aktivní franšíza        → auto
//   2) Nový režim Full/Operations management + kategorie         → auto
//      Core / Nice / SoSo
//   3) Vše ostatní                                               → schvalovatelé
//
// Hodnoty lokality bere z locationSnapshot smlouvy (zmrazený stav z Transition
// v okamžiku výběru), aby se rozhodnutí nerozpadlo při pozdější změně zrcadla.
// ─────────────────────────────────────────────────────────────────────────────

export type ApprovalLocationData = {
  category: LocationCategory | null;
  leaseStatus: LeaseStatus;
  newMode: LocationMode | null;
};

// Vrátí číslo auto-pravidla (1 nebo 2), které smlouvu schvaluje automaticky,
// nebo null = žádné auto-pravidlo neplatí (pravidlo 3, vyžaduje schvalovatele).
export function evaluateAutoApproval(loc: ApprovalLocationData): 1 | 2 | null {
  // Pravidlo 1: nájem na franšízanta + nový režim aktivní franšíza.
  if (loc.leaseStatus === "prepis_na_fransizanta" && loc.newMode === "franchise") {
    return 1;
  }
  // Pravidlo 2: provozní režim Full/Operations management + kategorie Core/Nice/SoSo.
  if (
    (loc.newMode === "full" || loc.newMode === "operations") &&
    (loc.category === "core" || loc.category === "nice" || loc.category === "soso")
  ) {
    return 2;
  }
  return null;
}

// „Na koho je nájemní smlouva" - lehce pozměněné labely oproti Transition
// (na BOS místo CEIP, na třetí stranu místo přepis jinam).
export const LEASE_HOLDER_LABEL: Record<LeaseStatus, string> = {
  prepis_na_fransizanta: "na franšízanta",
  prepis_na_ceip: "na BOS",
  prepis_jinam: "na třetí stranu",
  uzavrena_na_twist: "na TWIST",
  nemame_reseni: "nevyřešeno",
  neznamy: "neznámé",
};

// Nový režim - plné názvy pro panel schválení (kratší varianty má MODE_LABEL
// v locations-shared.ts).
export const NEW_MODE_LABEL: Record<LocationMode, string> = {
  full: "Full management",
  operations: "Operations management",
  franchise: "Aktivní franšíza",
};

// Klíč k automatickému schválení - text k vypsání na detailu smlouvy.
export const APPROVAL_KEY: Array<{ rule: 1 | 2 | 3; text: string }> = [
  {
    rule: 1,
    text: "Nájemní smlouva je na franšízanta a nový režim je aktivní franšíza → automaticky schváleno.",
  },
  {
    rule: 2,
    text: "Nový režim je Full management nebo Operations management a prodejna je v kategorii Core, Nice nebo SoSo → automaticky schváleno.",
  },
  {
    rule: 3,
    text: "Vše ostatní vyžaduje schválení schvalovatelů šablon.",
  },
];

// Odvozený stav schválení pro panel/odznak na detailu i v predikci.
export type ApprovalView =
  | { kind: "not-applicable" }
  | { kind: "needs-location" }
  | { kind: "draft"; autoRule: 1 | 2 | null }
  | { kind: "auto-approved"; rule: 1 | 2 }
  | { kind: "pending" }
  | { kind: "approved-by-approver"; by?: string; at?: string }
  | { kind: "grandfathered" };

export function getApprovalView(
  contract: Pick<
    Contract,
    | "type"
    | "status"
    | "locationId"
    | "locationSnapshot"
    | "approvalDecision"
    | "approvalRule"
    | "approvedBy"
    | "approvedAt"
  >,
): ApprovalView {
  if (!isApprovalGated(contract.type)) return { kind: "not-applicable" };

  const snap = contract.locationSnapshot ?? null;
  const isAdvanced = statusOrder(contract.status) >= statusOrder("schvaleno");

  // Lokalita ještě nevybraná.
  if (!contract.locationId && !snap) {
    // Stará smlouva už za schvalováním, bez záznamu pravidla = historicky.
    if (isAdvanced && !contract.approvalDecision) return { kind: "grandfathered" };
    return { kind: "needs-location" };
  }

  if (contract.status === "koncept") {
    return { kind: "draft", autoRule: snap ? evaluateAutoApproval(snap) : null };
  }
  if (contract.status === "ke-schvaleni") {
    return { kind: "pending" };
  }

  // schvaleno a dál:
  if (
    contract.approvalDecision === "auto" &&
    (contract.approvalRule === 1 || contract.approvalRule === 2)
  ) {
    return { kind: "auto-approved", rule: contract.approvalRule };
  }
  if (contract.approvalDecision === "manual") {
    return {
      kind: "approved-by-approver",
      by: contract.approvedBy,
      at: contract.approvedAt,
    };
  }
  // Pokročilá smlouva s lokalitou, ale bez záznamu rozhodnutí (např. backfill).
  return { kind: "grandfathered" };
}
