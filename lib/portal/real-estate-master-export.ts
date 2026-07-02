import { buildXlsx, type CellValue, type XlsxColumn, type XlsxSheet } from "./xlsx-writer";
import {
  listLocations,
  listLocationLocalMap,
  type LocationLocal,
  type MirroredLocation,
} from "./locations-db";
import { cachedListContracts, cachedListReFlags } from "./cached-db";
import {
  clientSignedAtEffective,
  contractDisplayStatus,
  CONTRACT_STATUS_LABEL,
  type Contract,
  type ContractStatus,
} from "./contracts-db";
import {
  CATEGORY_LABEL,
  CLIENT_STATUS_LABEL,
  CONCEPT_LABEL,
  LANDLORD_LABEL,
  MODE_LABEL,
  RE_AGENT_LABEL,
  TRANSITION_STATUS_LABEL,
} from "@/components/portal/locations/locations-shared";
import {
  isRedFlagged,
  LEASE_HOLDER_LABEL,
  RECON_META,
  RE_CHECKIN_META,
  reconcile,
  STORE_STATUS_META,
} from "@/components/portal/locations/real-estate-shared";

// ─────────────────────────────────────────────────────────────────────────────
// Server-side „master" export Real Estate do .xlsx. Cíl: jeden list, kde JE
// kompletní obraz každé lokality z importu NewCo - tj. (a) blok sloupců přesně ve
// formátu NewCo importu (re-importovatelný: hlavičky odpovídají aliasům v
// newco-fields, match klíč = Kód) a (b) NAVÍC všechno, co k lokalitě v systému
// máme: stav nájmu/řešení, klient + režim, podepsané smlouvy (franšíza /
// provozování / spolupráce / NDA) i Transition metadata.
//
// Generuje se na serveru (na rozdíl od původního klientského exportu), protože
// data o smlouvách/klientech nejsou v tabulce - sbírají se z více zdrojů.
// ─────────────────────────────────────────────────────────────────────────────

// Lokální data tak, jak je vrací listLocationLocalMap (subset LocationLocal).
type LocalSlice = Pick<
  LocationLocal,
  | "note"
  | "newco"
  | "flagIds"
  | "solveDespiteRed"
  | "manualRed"
  | "reCheckIn"
  | "accountingCenter"
>;

const ANO = "Ano";
const NE = "Ne";
const yesNo = (v: boolean | null | undefined): string => (v ? ANO : NE);

// "YYYY-MM-DD..." → "d.M.yyyy" (UTC, bez ICU/locale závislosti).
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}

// Pořadí stavů smlouvy (nejdál dosažený = nejvyšší). „zrusena" tu nefiguruje -
// zrušené filtrujeme přes !cancelledAt ještě dřív.
const STATUS_RANK: Record<ContractStatus, number> = {
  koncept: 0,
  "ke-schvaleni": 1,
  schvaleno: 2,
  "k-podpisu": 3,
  "podepsano-bos": 4,
  "podepsano-klientem": 5,
  archivovano: 6,
  zrusena: -1,
};

// Klient (efektivně) podepsal = zobrazovaný stav je „podepsáno klientem" a dál.
function signedByClient(c: Contract): boolean {
  const s = contractDisplayStatus(c);
  return s === "podepsano-klientem" || s === "archivovano";
}

// Reprezentativní smlouva daného typu pro lokalitu: nejdál ve flow (dle
// zobrazovaného stavu), při shodě nejnovější podle (efektivního) podpisu / vzniku.
function pickPrimary(contracts: Contract[], type: Contract["type"]): Contract | null {
  let best: Contract | null = null;
  let bestRank = -1;
  let bestWhen = "";
  for (const c of contracts) {
    if (c.type !== type) continue;
    const rank = STATUS_RANK[contractDisplayStatus(c)] ?? 0;
    const when = clientSignedAtEffective(c) ?? c.createdAt ?? "";
    if (rank > bestRank || (rank === bestRank && when > bestWhen)) {
      best = c;
      bestRank = rank;
      bestWhen = when;
    }
  }
  return best;
}

// Tři buňky za jednu smlouvu: podepsáno / stav / klient (+ datum podpisu zvlášť).
function contractCells(c: Contract | null): [string, string, string, string] {
  if (!c) return ["", "", "", ""];
  return [
    yesNo(signedByClient(c)),
    CONTRACT_STATUS_LABEL[contractDisplayStatus(c)],
    c.clientName ?? "",
    fmtDate(clientSignedAtEffective(c)),
  ];
}

// Označeno červeně: Ano / „Ano (ručně)" / Ne (+ „ (+ řešit)" u lokální výjimky).
function redFlagExport(local: LocalSlice | null): string {
  const newco = local?.newco ?? null;
  const manualRed = local?.manualRed ?? null;
  if (!newco && !manualRed) return "";
  if (!isRedFlagged({ newco, manualRed })) return NE;
  const base = manualRed && !newco?.flaggedRed ? "Ano (ručně)" : ANO;
  return local?.solveDespiteRed ? `${base} (+ řešit)` : base;
}

// Hlavičky + šířky. Pořadí MUSÍ odpovídat pořadí buněk v rowCells níž.
// NewCo blok (Kód … Category) má hlavičky shodné s aliasy v newco-fields, aby
// byl soubor zpětně importovatelný importem NewCo.
const COLUMNS: XlsxColumn[] = [
  // Identita lokality
  { header: "Lokalita", width: 30 },
  { header: "Kód", width: 14 },
  { header: "Koncept", width: 12 },
  { header: "Kategorie (Transition)", width: 18 },
  { header: "Stav prodejny", width: 16 },
  // NewCo import blok (re-importovatelné, raw hodnoty)
  { header: "Entita CEIP #1", width: 22 },
  { header: "Entita CEIP #2", width: 22 },
  { header: "103", width: 10 },
  { header: "INCLUDE IN BUSINESS PLAN (Y/N)", width: 30 },
  { header: "Operational type", width: 18 },
  { header: "Category", width: 16 },
  { header: "Označeno červeně", width: 18 },
  // Nájem / řešení
  { header: "RE agent", width: 14 },
  { header: "Nájem aktuálně", width: 18 },
  { header: "Nájem cílově", width: 18 },
  { header: "Stav řešení", width: 14 },
  { header: "Souhlas pronajímatele", width: 20 },
  { header: "Riziko vystěhování", width: 16 },
  { header: "Hlášení agenta", width: 22 },
  { header: "RE poznámka (Transition)", width: 40 },
  { header: "Další krok (Transition)", width: 40 },
  { header: "Poznámka (BOS)", width: 44 },
  { header: "Flagy", width: 28 },
  { header: "Účetní středisko", width: 16 },
  // Klient / režim
  { header: "Aktuální klient", width: 26 },
  { header: "Aktuální režim", width: 16 },
  { header: "Nový klient (kandidát)", width: 26 },
  { header: "Nový režim", width: 16 },
  { header: "Nový režim od", width: 14 },
  { header: "IČO klienta", width: 14 },
  { header: "Cílový franšízant", width: 22 },
  { header: "Stav klienta", width: 16 },
  // Smlouvy (per lokalita)
  { header: "Franšíza - podepsáno", width: 16 },
  { header: "Franšíza - stav", width: 20 },
  { header: "Franšíza - klient", width: 26 },
  { header: "Franšíza - podpis klienta", width: 18 },
  { header: "Provozování - podepsáno", width: 16 },
  { header: "Provozování - stav", width: 20 },
  { header: "Provozování - klient", width: 26 },
  { header: "Provozování - podpis klienta", width: 18 },
  { header: "Spolupráce - podepsáno", width: 16 },
  { header: "Spolupráce - stav", width: 20 },
  { header: "Spolupráce - klient", width: 26 },
  { header: "Spolupráce - podpis klienta", width: 18 },
  { header: "NDA - podepsáno", width: 14 },
  // Transition metadata
  { header: "Transition status", width: 18 },
  { header: "OP 2026", width: 12 },
  { header: "V nové TWIST", width: 14 },
  { header: "Datum otevření", width: 14 },
  { header: "Datum zavření", width: 14 },
  { header: "Aktualizováno", width: 14 },
];

function rowCells(
  loc: MirroredLocation,
  local: LocalSlice | null,
  contracts: Contract[],
  flagLabelById: Map<string, string>,
): CellValue[] {
  const newco = local?.newco ?? null;
  const flagLabels = (local?.flagIds ?? [])
    .map((id) => flagLabelById.get(id))
    .filter((l): l is string => Boolean(l))
    .join(", ");
  const reCheckIn = local?.reCheckIn ?? null;

  const fr = contractCells(pickPrimary(contracts, "franchise"));
  const op = contractCells(pickPrimary(contracts, "operation"));
  const co = contractCells(pickPrimary(contracts, "cooperation"));
  const nda = pickPrimary(contracts, "nda");

  return [
    // Identita
    loc.name,
    loc.code ?? "",
    CONCEPT_LABEL[loc.concept] ?? loc.concept ?? "",
    loc.category ? CATEGORY_LABEL[loc.category] : "",
    loc.location_status ? STORE_STATUS_META[loc.location_status].label : "",
    // NewCo blok (raw)
    newco?.entitaCeip1 ?? "",
    newco?.entitaCeip2 ?? "",
    newco?.field103 ?? "",
    newco?.includeInBusinessPlan ?? "",
    newco?.operationalType ?? "",
    newco?.category ?? "",
    redFlagExport(local),
    // Nájem / řešení
    loc.re_agent ? RE_AGENT_LABEL[loc.re_agent] : "",
    LEASE_HOLDER_LABEL[loc.lease_current_status],
    LEASE_HOLDER_LABEL[loc.lease_target_status],
    RECON_META[reconcile(loc.lease_current_status, loc.lease_target_status)].label,
    loc.landlord_agreement
      ? LANDLORD_LABEL[loc.landlord_agreement]
      : loc.landlord_agreement_raw ?? "",
    loc.eviction_risk ? ANO : "",
    reCheckIn
      ? `${RE_CHECKIN_META[reCheckIn.status].label} (${fmtDate(reCheckIn.at)})`
      : "",
    loc.re_status_note ?? "",
    loc.next_step ?? "",
    local?.note ?? "",
    flagLabels,
    local?.accountingCenter ?? "",
    // Klient / režim
    loc.current_client_name ?? "",
    loc.current_mode ? MODE_LABEL[loc.current_mode] : "",
    loc.new_client_name ?? "",
    loc.new_mode ? MODE_LABEL[loc.new_mode] : "",
    fmtDate(loc.new_mode_start_date),
    loc.client_ico ?? "",
    loc.target_franchisee ?? "",
    loc.client_status ? CLIENT_STATUS_LABEL[loc.client_status] : "",
    // Smlouvy
    fr[0],
    fr[1],
    fr[2],
    fr[3],
    op[0],
    op[1],
    op[2],
    op[3],
    co[0],
    co[1],
    co[2],
    co[3],
    nda ? yesNo(signedByClient(nda)) : "",
    // Transition metadata
    TRANSITION_STATUS_LABEL[loc.transition_status],
    typeof loc.op_2026 === "number" && loc.op_2026 ? loc.op_2026 : "",
    yesNo(loc.in_new_twist),
    fmtDate(loc.opening_date),
    fmtDate(loc.closing_date),
    fmtDate(loc.updated_at),
  ];
}

// Sestaví master .xlsx (Uint8Array). Zahrnuje lokality z importu NewCo
// (hasNewco) - tj. tytéž, co tvoří NewCo import tabulku - seřazené dle názvu.
export async function buildRealEstateMasterXlsx(): Promise<Uint8Array> {
  const [locations, localMap, contracts, flags] = await Promise.all([
    listLocations(),
    listLocationLocalMap(),
    cachedListContracts(),
    cachedListReFlags(),
  ]);

  const flagLabelById = new Map(flags.map((f) => [f.id, f.label]));

  // Smlouvy per lokalita (jen aktivní - zrušené pryč).
  const contractsByLocation = new Map<string, Contract[]>();
  for (const c of contracts) {
    if (!c.locationId || c.cancelledAt) continue;
    const arr = contractsByLocation.get(c.locationId);
    if (arr) arr.push(c);
    else contractsByLocation.set(c.locationId, [c]);
  }

  const rows = locations
    .map((loc) => ({ loc, local: localMap.get(loc.id) ?? null }))
    // Jen lokality v importu NewCo (= obsah NewCo tabulky).
    .filter(({ local }) => Boolean(local?.newco))
    .map(({ loc, local }) =>
      rowCells(loc, local, contractsByLocation.get(loc.id) ?? [], flagLabelById),
    );

  const sheet: XlsxSheet = { name: "Real Estate", columns: COLUMNS, rows };
  return buildXlsx([sheet]);
}
