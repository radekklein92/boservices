// Centrální definice tagů pro Next.js cache vrstvu. Mutation endpointy
// volají revalidateTag(TAG.x) → cached* read helpery se okamžitě obnoví.
// Granularita je per-entity (jeden tag pro celou kolekci, jednoduchost > optimum).
export const TAG = {
  contracts: "contracts",
  clients: "clients",
  users: "users",
  templates: "contract-templates",
  leads: "leads",
  locations: "locations",
  tasks: "tasks",
  claimsOverlay: "claims-overlay",
  claimsMirror: "claims-mirror",
  payouts: "payouts",
  invoices: "invoices",
  reFlags: "re-flags",
  // POS / pokladní dashboard: posData = krátká cache odpovědí z API DW (čte se,
  // ne mutuje - bustuje se hlavně přes TTL); posPairing = crosswalk pobočka<->lokalita
  // (mutuje admin párovací UI, proto read-your-writes bust).
  posData: "pos-data",
  posPairing: "pos-pairing",
} as const;

export type CacheTag = (typeof TAG)[keyof typeof TAG];
