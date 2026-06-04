import { isApprovalGated, type ContractType } from "./contract-types";
import { statusOrder, type Contract } from "./contracts-db";
import {
  franchiseFeePercentValue,
  operatingFeeAmountValue,
} from "./contract-fees";
import type { LeaseStatus, LocationMode } from "./locations-db";

// ─────────────────────────────────────────────────────────────────────────────
// Schvalování smluv posuzovaných podle lokality (franšíza, spolupráce,
// provozování). Smlouva projde AUTOMATICKY, pokud neplatí žádná z podmínek
// klíče; jakmile platí aspoň jedna, posoudí ji schvalovatelé šablon.
//
// Vstupy:
//  - „nový režim" lokality (newMode: aktivní franšíza / Operations / Full mgmt)
//    a „na koho je nájem" (leaseStatus) - ze zmrazeného locationSnapshot smlouvy,
//  - NewCo data lokality (Entita CEIP #1, Operational type, přítomnost v souboru),
//  - částky z textu smlouvy (franšízový poplatek %, odměna Kč) - dle typu smlouvy.
//
// Při chybějících datech (nevyplněný režim, nelze určit částku) se rozhoduje
// konzervativně: vyžaduje ruční schválení.
// ─────────────────────────────────────────────────────────────────────────────

// NewCo souhrn lokality potřebný pro vyhodnocení klíče.
export type NewcoSummary = {
  inFile: boolean;
  entitaCeip1: string;
  operationalType: string;
};

// Jeden důvod, proč smlouva míří ke schvalovatelům (code = stabilní klíč,
// label = lidský text do panelu).
export type ApprovalReason = { code: string; label: string };

export type ApprovalInput = {
  contractType: ContractType;
  newMode: LocationMode | null;
  leaseStatus: LeaseStatus;
  newco: NewcoSummary | null;
  // Franšízový poplatek (%) - jen u franšízingové smlouvy. null = nelze určit.
  franchiseFeePercent: number | null;
  // Odměna (Kč) - u spolupráce / provozování. null = nelze určit.
  operatingFeeAmount: number | null;
};

export type ApprovalResult = { auto: boolean; reasons: ApprovalReason[] };

const FRANCHISE_FEE_MIN_DEFAULT = 3;
const FRANCHISE_FEE_MIN_FULL = 5;
const SUPPORT_FEE_MIN = 15000;
const OPERATING_FEE_MIN = 30000;

const eq = (value: string, target: string) =>
  value.trim().toUpperCase() === target;

// Vyhodnotí klíč nad připraveným vstupem. Vrací auto = true (žádná podmínka
// neplatí → automaticky schváleno), jinak seznam důvodů pro schvalovatele.
export function evaluateApproval(input: ApprovalInput): ApprovalResult {
  const { contractType, newMode, leaseStatus, newco } = input;
  const reasons: ApprovalReason[] = [];

  // a) Entita CEIP #1 = TBE
  if (newco && eq(newco.entitaCeip1, "TBE")) {
    reasons.push({ code: "entita-tbe", label: "Entita CEIP #1 je „TBE“" });
  }
  // b) Operational type = OWN
  if (newco && eq(newco.operationalType, "OWN")) {
    reasons.push({ code: "optype-own", label: "Operational type je „OWN“" });
  }

  // Bez nového režimu nelze posoudit zbytek klíče → konzervativně ke schvalovatelům.
  if (!newMode) {
    reasons.push({
      code: "unknown-mode",
      label: "Lokalita nemá vyplněný nový režim",
    });
    return { auto: reasons.length === 0, reasons };
  }

  const isFull = newMode === "full";
  const isFranchiseOrOps = newMode === "franchise" || newMode === "operations";

  // c) Full management a lokalita není v souboru NEWCO
  if (isFull && (!newco || !newco.inFile)) {
    reasons.push({
      code: "not-in-newco",
      label: "Full management, ale lokalita není v souboru NEWCO",
    });
  }

  // h/i) nájem
  if (isFranchiseOrOps) {
    if (
      leaseStatus !== "prepis_na_fransizanta" &&
      leaseStatus !== "prepis_na_ceip"
    ) {
      reasons.push({
        code: "lease-not-fr-bos",
        label: "Nájem není na franšízanta ani na BOS",
      });
    }
  } else if (isFull) {
    if (leaseStatus !== "prepis_na_ceip") {
      reasons.push({
        code: "lease-not-bos",
        label: "Full management, ale nájem není na BOS",
      });
    }
  }

  // d-g) poplatky/odměny dle typu smlouvy
  if (contractType === "franchise") {
    const threshold = isFull ? FRANCHISE_FEE_MIN_FULL : FRANCHISE_FEE_MIN_DEFAULT;
    const fee = input.franchiseFeePercent;
    if (fee === null) {
      reasons.push({
        code: "fee-unknown",
        label: "Z textu nelze určit franšízový poplatek",
      });
    } else if (fee < threshold) {
      reasons.push({
        code: "franchise-fee-low",
        label: `Franšízový poplatek je pod ${threshold} %`,
      });
    }
  } else if (contractType === "cooperation") {
    const fee = input.operatingFeeAmount;
    if (fee === null) {
      reasons.push({
        code: "fee-unknown",
        label: "Z textu nelze určit odměnu za podporu",
      });
    } else if (fee < SUPPORT_FEE_MIN) {
      reasons.push({
        code: "support-fee-low",
        label: "Odměna za podporu je pod 15 000 Kč",
      });
    }
  } else if (contractType === "operation") {
    const fee = input.operatingFeeAmount;
    if (fee === null) {
      reasons.push({
        code: "fee-unknown",
        label: "Z textu nelze určit odměnu za provozování",
      });
    } else if (fee < OPERATING_FEE_MIN) {
      reasons.push({
        code: "operating-fee-low",
        label: "Odměna za provozování je pod 30 000 Kč",
      });
    }
  }

  return { auto: reasons.length === 0, reasons };
}

// Poskládá vstup klíče z konkrétní smlouvy (snapshot lokality + částky z textu)
// a NewCo souhrnu, a vyhodnotí ho. Použitelné na serveru i v klientu (pure).
export function evaluateApprovalForContract(
  contract: Pick<
    Contract,
    "type" | "html" | "variables" | "locationSnapshot"
  >,
  newco: NewcoSummary | null,
): ApprovalResult {
  const snap = contract.locationSnapshot ?? null;
  return evaluateApproval({
    contractType: contract.type,
    newMode: snap?.newMode ?? null,
    leaseStatus: snap?.leaseStatus ?? "neznamy",
    newco,
    franchiseFeePercent: franchiseFeePercentValue(contract),
    operatingFeeAmount: operatingFeeAmountValue(contract),
  });
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

// Klíč k automatickému schválení - srozumitelný popis do panelu. Smlouva projde
// automaticky, pokud neplatí žádná z těchto podmínek.
export const APPROVAL_KEY_INTRO =
  "Smlouva se schválí automaticky, pokud neplatí žádná z podmínek níže. Jakmile platí aspoň jedna, posoudí ji schvalovatelé šablon.";

export const APPROVAL_KEY: string[] = [
  "Entita CEIP #1 je „TBE“.",
  "Operational type je „OWN“.",
  "Full management a lokalita chybí v souboru NEWCO.",
  "Nájem není na franšízanta ani na BOS (u aktivní franšízy nebo Operations managementu).",
  "Nájem není na BOS (u Full managementu).",
  "Franšízový poplatek pod 3 % (aktivní franšíza / Operations management), resp. pod 5 % (Full management).",
  "Odměna za podporu pod 15 000 Kč (Operations management).",
  "Odměna za provozování pod 30 000 Kč (Full management).",
];

// Odvozený stav schválení pro panel/odznak na detailu i v predikci.
export type ApprovalView =
  | { kind: "not-applicable" }
  | { kind: "needs-location" }
  | { kind: "draft"; auto: boolean; reasons: ApprovalReason[] }
  | { kind: "auto-approved" }
  // auto = po opravě dat by smlouva nově prošla automaticky (nemá blokující důvody).
  | { kind: "pending"; reasons: ApprovalReason[]; auto: boolean }
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
    | "approvalReasons"
    | "approvedBy"
    | "approvedAt"
    | "html"
    | "variables"
  >,
  newco: NewcoSummary | null = null,
): ApprovalView {
  if (!isApprovalGated(contract.type)) return { kind: "not-applicable" };

  const snap = contract.locationSnapshot ?? null;
  const isAdvanced = statusOrder(contract.status) >= statusOrder("schvaleno");

  // Lokalita ještě nevybraná.
  if (!contract.locationId && !snap) {
    // Stará smlouva už za schvalováním, bez záznamu rozhodnutí = historicky.
    if (isAdvanced && !contract.approvalDecision) return { kind: "grandfathered" };
    return { kind: "needs-location" };
  }

  if (contract.status === "koncept") {
    if (!snap) return { kind: "draft", auto: false, reasons: [] };
    const res = evaluateApprovalForContract(contract, newco);
    return { kind: "draft", auto: res.auto, reasons: res.reasons };
  }
  if (contract.status === "ke-schvaleni") {
    // Smlouva ještě není schválená → přepočítáme živě (snapshot lokality je na
    // detailu držený čerstvý vůči Transition). Když po opravě dat nově nemá
    // blokující důvody, auto = true a panel poradí, jak ji dotáhnout.
    if (snap) {
      const res = evaluateApprovalForContract(contract, newco);
      return { kind: "pending", reasons: res.reasons, auto: res.auto };
    }
    const stored = contract.approvalReasons ?? [];
    return {
      kind: "pending",
      reasons: stored.map((label) => ({ code: "stored", label })),
      auto: stored.length === 0,
    };
  }

  // schvaleno a dál:
  if (
    contract.approvalDecision === "auto" ||
    contract.approvalRule === 1 ||
    contract.approvalRule === 2 ||
    contract.approvalRule === 3
  ) {
    return { kind: "auto-approved" };
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
