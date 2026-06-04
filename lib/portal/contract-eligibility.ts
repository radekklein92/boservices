import type { ContractType } from "./contract-types";
import type { LeaseStatus, LocationMode } from "./locations-db";

// Soulad typu/varianty smlouvy se stavem lokality (nájem + nový režim). Sdílené
// klient (modal Nová smlouva) i server (create route):
// - Franšíza: lze vytvořit v jakémkoli režimu, jen varianta dle nájmu
//   (na franšízanta = A/„AB", jinak = B).
// - Smlouva o spolupráci a podpoře = nový režim Operations management.
// - Smlouva o provozování provozovny = nový režim Full management.

export function requiredFranchiseVariant(
  leaseStatus: LeaseStatus | null,
): "AB" | "B" {
  return leaseStatus === "prepis_na_fransizanta" ? "AB" : "B";
}

export type EligibilityResult =
  | { ok: true; forcedVariant?: "AB" | "B" }
  | { ok: false; reason: string };

export function checkContractEligibility(input: {
  type: ContractType;
  leaseStatus: LeaseStatus | null;
  newMode: LocationMode | null;
}): EligibilityResult {
  const { type, leaseStatus, newMode } = input;

  if (type === "cooperation" && newMode !== "operations") {
    return {
      ok: false,
      reason:
        "Smlouva o spolupráci a podpoře je určená pro nový režim Operations management.",
    };
  }
  if (type === "operation" && newMode !== "full") {
    return {
      ok: false,
      reason:
        "Smlouva o provozování provozovny je určená pro nový režim Full management.",
    };
  }
  if (type === "franchise") {
    return { ok: true, forcedVariant: requiredFranchiseVariant(leaseStatus) };
  }
  return { ok: true };
}
