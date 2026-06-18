// Overlay vrstva nad postoupenými pohledávkami (čistě analytická, dashboard).
// Drží dvě věci, které NEJSOU součástí podepsaných smluv (a nesmí je mutovat):
//   1) ruční pohledávky mimo smlouvy (ManualClaim)
//   2) cross-ručení navázané na existující smluvní pohledávku přes ClaimItem.id
//
// Ručitel (Guarantor) = firma, která za pohledávku ručí. V insolvenci se ručení
// dá uplatnit, jen pokud vzniklo více než rok před podáním insolvenčního návrhu
// (jinak je odporovatelné) -> proto povinné potvrzení confirmedOverOneYear.
// Bez potvrzení se ručitel do součtů NEZAPOČÍTÁ (bezpečnostní gate).
//
// POZOR (DPH): částky jsou - stejně jako u smluvních pohledávek - VČETNĚ DPH.
// Tento soubor neobsahuje žádné IO (Redis), jen typy + čisté helpery.

// Stabilní id pro React key + identitu při editaci. Stejný trik jako newClaimItem
// v claims.ts (crypto.randomUUID s fallbackem pro starší runtime).
function newId(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface Guarantor {
  id: string;
  // Zvolený string názvu firmy. Agregace klíčuje výhradně podle tohoto stringu
  // (po trim), proto picker nabízí primárně existující debtorName z breakdownu,
  // aby cross-ručení padlo na stejný řádek jako smluvní dlužník.
  company: string;
  // Gate: false => firma se do součtů NEzapočítá. Potvrzuje, že ručení vzniklo
  // více než rok před podáním návrhu na insolvenci.
  confirmedOverOneYear: boolean;
}

export interface ManualClaim {
  id: string;
  name: string; // povinné (název pohledávky)
  amount: string; // syrový vstup vč. DPH, parsuje se přes parseClaimAmount
  primaryDebtor: string; // 1 firma - primární dlužník, počítá se vždy
  guarantors: Guarantor[]; // 0..n ručitelů
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimsOverlay {
  manualClaims: ManualClaim[];
  // Klíč = ClaimItem.id smluvní pohledávky (nebo fallback `${contractId}#${index}`).
  guaranteesByClaimId: Record<string, Guarantor[]>;
}

export const EMPTY_OVERLAY: ClaimsOverlay = {
  manualClaims: [],
  guaranteesByClaimId: {},
};

export function newGuarantor(): Guarantor {
  return { id: newId("g"), company: "", confirmedOverOneYear: false };
}

export function newManualClaim(): ManualClaim {
  const now = new Date().toISOString();
  return {
    id: newId("mc"),
    name: "",
    amount: "",
    primaryDebtor: "",
    guarantors: [],
    note: "",
    createdAt: now,
    updatedAt: now,
  };
}

// Jen ručitelé, kteří se mají započítat: potvrzení + neprázdná firma.
export function confirmedGuarantors(gs: Guarantor[] | undefined): Guarantor[] {
  return (gs ?? []).filter((g) => g.confirmedOverOneYear && g.company.trim());
}

// Odstraní duplicitní firmy (uživatel mohl přidat tutéž firmu 2x) - každá firma
// max jednou, aby se táž pohledávka nezapočítala u jedné firmy vícekrát.
export function dedupeByCompany(gs: Guarantor[]): Guarantor[] {
  const seen = new Set<string>();
  const out: Guarantor[] = [];
  for (const g of gs) {
    const key = g.company.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}
