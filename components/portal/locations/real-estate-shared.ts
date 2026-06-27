import {
  AlertTriangle,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import type {
  LeaseStatus,
  LocationCategory,
  LocationNewCo,
  LocationStatus,
  ReAgent,
  ReCheckInStatus,
} from "@/lib/portal/locations-db";

// ─────────────────────────────────────────────────────────────────────────────
// Sdílené (server↔klient) typy a labely pro Real Estate tabulku. Soubor je
// client-safe: z datové vrstvy se berou jen TYPY (`import type`), žádný runtime
// kód (Redis). Labely držitele nájmu se sem ZÁMĚRNĚ duplikují místo importu
// z contract-approval.ts — ten žije v modulu se server-only kódem.
// ─────────────────────────────────────────────────────────────────────────────

// Jeden řádek tabulky. Sestavuje ho server (page.tsx) z MirroredLocation +
// lokálních dat; přes RSC boundary jdou jen plain objekty (žádná Map).
export type RealEstateRow = {
  id: string;
  name: string;
  code: string | null;
  hasNewco: boolean;
  newco: LocationNewCo | null;
  note: string;
  // RE agent z Transition (zdroj pravdy). Edituje se write-through do Transition.
  reAgent: ReAgent | null;
  // Stav prodejny dle Transition (otevřená/zavřená/...). Read-only, zrcadlí se.
  locationStatus: LocationStatus | null;
  // Kategorie lokality dle Transition (core/nice/soso/...). Zdroj pravdy je
  // Transition, read-only zrcadlo. NEZAMĚŇOVAT s `newco.category` (volný string
  // z NewCo Excelu) — sloupec „Kategorie" ukazuje tuhle Transition hodnotu.
  category: LocationCategory | null;
  // Id přiřazených uživatelských flagů (lokální v BOServices, LocationLocal.flagIds).
  // Definice flagů (label+barva) drží katalog ReFlag[] předaný do tabulky zvlášť.
  flagIds: string[];
  // „Stejně řešit" navzdory červené (lokální v BOServices, LocationLocal.solveDespiteRed).
  // Červené jsou jinak samostatná kategorie mimo Řešit/Vyřešeno; s tímto příznakem
  // lokalita zůstane v „Červeně" a NAVÍC se vždy započítá do „Řešit". Bez efektu,
  // když lokalita není flaggedRed.
  solveDespiteRed: boolean;
  // Ruční označení „Červeně" (mimo import NewCo; lokální, LocationLocal.manualRed).
  // null = ručně neoznačeno. Pro lokalitu, která NENÍ červená z importu, ji takto
  // lze označit ručně — v UI se odliší od importu (kdo/kdy). Sdílí red bucket
  // logiku s flaggedRed (viz isRedFlagged).
  manualRed: { by: string; at: string } | null;
  leaseCurrent: LeaseStatus;
  leaseTarget: LeaseStatus;
  // Id podepsané franšízingové smlouvy (status „podepsáno klientem"+ vč. DigiSign
  // mezistavu, bez zrušených) — null = lokalita ji nemá. Stejný zdroj jako badge
  // „franšíza" na stránce Lokality (listLocationFranchiseContracts).
  franchiseContractId: string | null;
  // Poslední check-in RE agenta z Telegramu (lokální, LocationLocal.reCheckIn).
  // Hlášení postupu agenta — oddělené od systémové reconciliace nájmu. Když agent
  // hlásí „Vyřešeno", ale recon je pořád „Řešit", je to viditelný nesoulad.
  reCheckIn: { status: ReCheckInStatus; at: string } | null;
};

// Je lokalita „Červeně"? Sjednocuje oba zdroje: červená z importu NewCo
// (newco.flaggedRed) NEBO ruční označení (manualRed). Sdílený predikát pro
// red bucket, řazení i export, ať se oba zdroje chovají identicky.
export function isRedFlagged(
  r: Pick<RealEstateRow, "newco" | "manualRed">,
): boolean {
  return Boolean(r.newco?.flaggedRed) || Boolean(r.manualRed);
}

// Patří řádek do samostatné kategorie „Červeně"? Jen NEVYŘEŠENÁ červená: červená
// lokalita s vyřešeným nájmem (recon=resolved) přepadá do „Vyřešeno" a z „Červeně"
// mizí. Sdílený predikát pro filtr, počty i řazení v tabulce A pro týdenní snímky
// (cron) i živý bod grafu, ať čísla i křivky sedí 1:1 s tabulkou.
export function isRedBucket(
  r: Pick<RealEstateRow, "newco" | "manualRed" | "leaseCurrent" | "leaseTarget">,
): boolean {
  return isRedFlagged(r) && reconcile(r.leaseCurrent, r.leaseTarget) === "needs";
}

// Globální počty tří kategorií — přesně jako chipy nad tabulkou (bez textového
// ani flag filtru). Invariant (shodný s reconCounts/redCount v tabulce):
// - Nevyřešená červená → `red`. Když má „stejně řešit" (solveDespiteRed),
//   započítá se ZÁROVEŇ do `needs` (záměrné dvojí započtení, jako chip „Řešit").
// - Vyřešená červená přepadá do `resolved` (řeší ji reconcile, ne red bucket).
// - Nečervená → dle reconcile do `needs` / `resolved`.
// Sdíleno mezi cronem (týdenní snímek) a živým bodem grafu.
export type ReconCounts = { needs: number; resolved: number; red: number };

export function computeReconCounts(
  rows: ReadonlyArray<
    Pick<
      RealEstateRow,
      "newco" | "manualRed" | "leaseCurrent" | "leaseTarget" | "solveDespiteRed"
    >
  >,
): ReconCounts {
  const m: ReconCounts = { needs: 0, resolved: 0, red: 0 };
  for (const r of rows) {
    if (isRedBucket(r)) {
      m.red++;
      if (r.solveDespiteRed) m.needs++;
      continue;
    }
    m[reconcile(r.leaseCurrent, r.leaseTarget)]++;
  }
  return m;
}

// ── Stav řešení nájmu (porovnání aktuální vs cílový) ──────────────────────────

export type ReconStatus = "resolved" | "needs";

// Cíl, který není konkrétní → spadá pod „Řešit" (je co dořešit, ať už chybí
// určení cíle, nebo se aktuální stav liší od cílového).
const VAGUE_TARGET: ReadonlySet<LeaseStatus> = new Set<LeaseStatus>([
  "neznamy",
  "nemame_reseni",
]);

// - needs: cíl není určený (testuje se PRVNÍ — kryje i current=target=neznamy)
// - needs: aktuální === TWIST → vždy je co řešit (přepsat jinam), i kdyby se to
//   shodovalo s cílem — TWIST je tranzitní entita, ne přípustný cílový stav
// - resolved: aktuální === cílový a cíl je konkrétní → hotovo, nemakat
// - needs: aktuální !== cílový → je co řešit, makat
export function reconcile(current: LeaseStatus, target: LeaseStatus): ReconStatus {
  if (VAGUE_TARGET.has(target)) return "needs";
  if (current === "uzavrena_na_twist") return "needs";
  if (current === target) return "resolved";
  return "needs";
}

export const RECON_META: Record<
  ReconStatus,
  { label: string; tone: string; dot: string; Icon: LucideIcon; hint: string }
> = {
  needs: {
    label: "Řešit",
    tone: "border-amber-300 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
    Icon: AlertTriangle,
    hint: "Aktuální nájem se liší od cílového, nebo cíl ještě není určený — je co řešit.",
  },
  resolved: {
    label: "Vyřešeno",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    Icon: CheckCircle2,
    hint: "Aktuální nájem už odpovídá cílovému.",
  },
};

// Pořadí pro filtrovací chipy i default sort (needs-attention first).
export const RECON_ORDER: ReconStatus[] = ["needs", "resolved"];
export const RECON_SORT_WEIGHT: Record<ReconStatus, number> = {
  needs: 0,
  resolved: 1,
};

// ── Hlášení RE agenta (check-in z Telegramu) ─────────────────────────────────
// Sebehlášený postup agenta na lokalitě (LocationLocal.reCheckIn). NEZAMĚŇOVAT
// s reconcile() — to je systémové porovnání nájmu. Tóny: vyřešeno = emerald,
// řeším = sky, problém = red.
export const RE_CHECKIN_META: Record<
  ReCheckInStatus,
  { label: string; tone: string }
> = {
  resolved: {
    label: "Vyřešeno",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
  in_progress: {
    label: "Řeším",
    tone: "border-sky-300 bg-sky-50 text-sky-700",
  },
  problem: {
    label: "Problém",
    tone: "border-red-300 bg-red-50 text-red-700",
  },
};

// Řazení sloupce „Hlášení agenta": problém nahoře → řeším → vyřešeno → bez hlášení.
export const RE_CHECKIN_SORT_WEIGHT: Record<ReCheckInStatus, number> = {
  problem: 0,
  in_progress: 1,
  resolved: 2,
};

// ── Krátké labely "na koho je nájem" (sloupce Nájem aktuálně/cílově) ──────────
// Zrcadlí LEASE_HOLDER_LABEL z contract-approval.ts (client-safe kopie).
export const LEASE_HOLDER_LABEL: Record<LeaseStatus, string> = {
  prepis_na_fransizanta: "na franšízanta",
  prepis_na_ceip: "na BOS",
  prepis_jinam: "na třetí stranu",
  uzavrena_na_twist: "na TWIST",
  nemame_reseni: "nevyřešeno",
  neznamy: "neznámé",
};

// ── Přehled „Nájem cílově" nad tabulkou ──────────────────────────────────────
// Pořadí + krátké labely dlaždic (kam nájem cílově míří). ZÁMĚRNĚ jen tři cílové
// destinace (franšízant → BOS → třetí strana) — tranzitní TWIST a neurčené stavy
// (nevyřešeno/neznámé) se v souhrnu nezobrazují; ke „kolik ještě zbývá dořešit"
// slouží chip „Řešit". Procenta se počítají proti celkovému `total` (všechny
// zobrazené řádky), takže součet těchto tří dlaždic může být < 100 %.
// Tečka = stejný barevný klíč jako jinde v portálu (emerald = cíl/hotovo).
export const LEASE_TARGET_SUMMARY: ReadonlyArray<{
  status: LeaseStatus;
  label: string;
  dot: string;
}> = [
  { status: "prepis_na_fransizanta", label: "Franšízant", dot: "bg-emerald-500" },
  { status: "prepis_na_ceip", label: "BOS", dot: "bg-sky-500" },
  { status: "prepis_jinam", label: "Třetí strana", dot: "bg-violet-500" },
];

// ── Přehled „Po agentech" nad tabulkou ───────────────────────────────────────
// Druhá souhrnná karta vedle „Nájem cílově": kolik zobrazených lokalit připadá
// na kterého RE agenta. ZÁMĚRNĚ jen tři aktivní agenti (Krampera, Šiarik,
// Kholová) — Granský/Neužil a lokality bez agenta se v souhrnu nezobrazují, takže
// součet dlaždic může být < total. Barevné tečky; labely z RE_AGENT_LABEL
// (locations-shared).
export const RE_AGENT_SUMMARY: ReadonlyArray<{
  agent: ReAgent;
  dot: string;
}> = [
  { agent: "Krampera", dot: "bg-sky-500" },
  { agent: "Siarik", dot: "bg-emerald-500" },
  { agent: "Kholova", dot: "bg-violet-500" },
];

// ── V business plánu (Y/N) — hodnota je volný string z NewCo Excelu ──────────
const BP_YES = new Set(["Y", "YES", "ANO", "A", "TRUE", "1"]);
const BP_NO = new Set(["N", "NO", "NE", "FALSE", "0"]);

export function businessPlanView(
  raw: string | null | undefined,
): { label: string; tone: string } | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const u = v.toUpperCase();
  if (BP_YES.has(u)) return { label: "Ano", tone: "border-edge bg-paper text-ink-deep" };
  if (BP_NO.has(u)) return { label: "Ne", tone: "border-edge bg-edge-warm text-ink-soft" };
  return { label: v, tone: "border-edge bg-paper text-ink-deep" };
}

// ── Stav prodejny dle Transition (location_status) ───────────────────────────
// Otevřená/zavřená je to, co uživatel primárně chce vidět; mezistavy (výstavba,
// zavírání) ukazujeme taky, ať pohled odpovídá Transition 1:1.

export const STORE_STATUS_META: Record<
  LocationStatus,
  { label: string; tone: string }
> = {
  open: {
    label: "Otevřená",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
  closing: {
    label: "Zavírá se",
    tone: "border-amber-300 bg-amber-50 text-amber-700",
  },
  construction: {
    label: "Ve výstavbě",
    tone: "border-sky-300 bg-sky-50 text-sky-700",
  },
  closed: {
    label: "Zavřená",
    tone: "border-edge bg-edge-warm text-ink-soft",
  },
};

// Řazení: provozní stavy nahoře, zavřené dolů; null (neznámý) úplně poslední.
export const STORE_STATUS_SORT_WEIGHT: Record<LocationStatus, number> = {
  open: 0,
  closing: 1,
  construction: 2,
  closed: 3,
};

// ── Sloupce (pro přepínání viditelnosti) ──────────────────────────────────────

export type ColumnId =
  | "location"
  | "storeStatus"
  | "reAgent"
  | "ceip1"
  | "ceip2"
  | "businessPlan"
  | "operationalType"
  | "category"
  | "flaggedRed"
  | "franchise"
  | "leaseCurrent"
  | "leaseTarget"
  | "recon"
  | "reCheckIn"
  | "note";

export type ColumnDef = {
  id: ColumnId;
  label: string;
  defaultVisible: boolean;
  // Lokalita se nedá skrýt (identita řádku, sticky první sloupec).
  always?: boolean;
};

// Pořadí v poli = výchozí pořadí sloupců zleva doprava. Uživatel si pořadí
// i viditelnost přeskupuje sám (dnd-kit v dropdownu "Sloupce"), uloží se do
// localStorage. defaultVisible = výchozí sada pro toho, kdo si nic nenastavil.
export const COLUMNS: ColumnDef[] = [
  { id: "location", label: "Lokalita", defaultVisible: true, always: true },
  { id: "storeStatus", label: "Stav prodejny", defaultVisible: true },
  { id: "reAgent", label: "RE agent", defaultVisible: true },
  { id: "ceip1", label: "Entita CEIP 1", defaultVisible: false },
  { id: "ceip2", label: "Entita CEIP 2", defaultVisible: false },
  { id: "businessPlan", label: "Business plán", defaultVisible: false },
  { id: "operationalType", label: "Operational type", defaultVisible: false },
  { id: "category", label: "Kategorie", defaultVisible: false },
  { id: "flaggedRed", label: "Červeně", defaultVisible: true },
  { id: "franchise", label: "Franšíza", defaultVisible: true },
  { id: "leaseCurrent", label: "Nájem aktuálně", defaultVisible: true },
  { id: "leaseTarget", label: "Nájem cílově", defaultVisible: true },
  { id: "recon", label: "Stav řešení", defaultVisible: true },
  { id: "reCheckIn", label: "Hlášení agenta", defaultVisible: true },
  { id: "note", label: "Poznámka", defaultVisible: true },
];

export const COLUMNS_BY_ID: Map<ColumnId, ColumnDef> = new Map(
  COLUMNS.map((c) => [c.id, c]),
);

// Uložený stav sloupců: pořadí (permutace ColumnId) + viditelná sada.
export type StoredColumnState = { order: ColumnId[]; visible: ColumnId[] };

// v5: nový formát {order, visible} — uživatel si přeskupuje i pořadí sloupců;
// zúžené defaulty (CEIP1/Business plán/Operational type/Kategorie skryté).
// Migrace ze starého v4 (ColumnId[] = jen viditelnost) zachová custom sadu,
// ať se nikomu, kdo si sloupce nastavil, pohled nepřepíše.
export const COLUMN_STORAGE_KEY = "re-table-cols-v5";
export const COLUMN_STORAGE_KEY_LEGACY = "re-table-cols-v4";

// Vrátí validní pořadí sloupců: always sloupce (Lokalita) vždy první kvůli
// sticky layoutu, pak uložené pořadí (jen platná ID, bez duplicit), nakonec
// doplní sloupce, které v uloženém pořadí chybí (nově přidané), v pořadí COLUMNS.
export function normalizeColumnOrder(saved: readonly ColumnId[] | undefined): ColumnId[] {
  const alwaysIds = COLUMNS.filter((c) => c.always).map((c) => c.id);
  const seen = new Set<ColumnId>(alwaysIds);
  const rest: ColumnId[] = [];
  for (const id of saved ?? []) {
    if (COLUMNS_BY_ID.has(id) && !seen.has(id)) {
      rest.push(id);
      seen.add(id);
    }
  }
  for (const c of COLUMNS) {
    if (!seen.has(c.id)) {
      rest.push(c.id);
      seen.add(c.id);
    }
  }
  return [...alwaysIds, ...rest];
}

// Vrátí viditelnou sadu. saved === undefined → výchozí (defaultVisible).
// saved zadané → přesně tato sada (jen platná ID); always sloupce vždy přidá.
export function normalizeVisibleCols(saved: readonly ColumnId[] | undefined): Set<ColumnId> {
  const out = new Set<ColumnId>();
  if (saved === undefined) {
    for (const c of COLUMNS) if (c.defaultVisible) out.add(c.id);
  } else {
    for (const id of saved) if (COLUMNS_BY_ID.has(id)) out.add(id);
  }
  for (const c of COLUMNS) if (c.always) out.add(c.id);
  return out;
}
