import { buildXlsx, type XlsxColumn, type XlsxSheet } from "@/lib/portal/xlsx-writer";
import { CATEGORY_LABEL, RE_AGENT_LABEL } from "./locations-shared";
import {
  businessPlanView,
  LEASE_HOLDER_LABEL,
  RECON_META,
  reconcile,
  STORE_STATUS_META,
  type RealEstateRow,
} from "./real-estate-shared";

// ─────────────────────────────────────────────────────────────────────────────
// Klientský export Real Estate tabulky do .xlsx. Záměrně se generuje na klientu
// (přes sdílený buildXlsx, který vrací Uint8Array), aby výstup přesně odpovídal
// tomu, co uživatel vidí - po filtrech, řazení i inline editaci (ty jdou
// optimisticky do stavu, server by je z unstable_cache hned po editaci ještě
// neviděl). JSZip se do bundlu natáhne až lazy přes dynamický import v UI.
// Exportují se VŠECHNY datové sloupce bez ohledu na jejich viditelnost v tabulce
// (skrytí sloupce je jen vizuální preference, do exportu patří celá data).
// ─────────────────────────────────────────────────────────────────────────────

// Hlavičky + šířky sloupců (v "znacích" Excelu). Pořadí = pořadí buněk níž.
const COLUMNS: XlsxColumn[] = [
  { header: "Lokalita", width: 30 },
  { header: "Kód", width: 14 },
  { header: "Stav prodejny", width: 16 },
  { header: "RE agent", width: 14 },
  { header: "Flagy", width: 30 },
  { header: "Entita CEIP 1", width: 22 },
  { header: "Entita CEIP 2", width: 22 },
  { header: "Business plán", width: 14 },
  { header: "Operational type", width: 18 },
  { header: "Kategorie", width: 16 },
  { header: "Označeno červeně", width: 16 },
  { header: "Franšíza", width: 14 },
  { header: "Nájem aktuálně", width: 18 },
  { header: "Nájem cílově", width: 18 },
  { header: "Stav řešení", width: 14 },
  { header: "V importu NewCo", width: 16 },
  { header: "Poznámka", width: 44 },
];

// Sloupec „Označeno červeně": Ano/Ne jen když lokalita má NewCo data (jinak
// prázdno - hodnota není známá). U červené s lokální výjimkou „stejně řešit"
// se to vyznačí jako „Ano (+ řešit)".
function redFlagExport(r: RealEstateRow): string {
  if (!r.newco) return "";
  if (!r.newco.flaggedRed) return "Ne";
  return r.solveDespiteRed ? "Ano (+ řešit)" : "Ano";
}

function rowCells(
  r: RealEstateRow,
  flagLabelById: Map<string, string>,
): (string | number)[] {
  const bp = businessPlanView(r.newco?.includeInBusinessPlan);
  const flagLabels = r.flagIds
    .map((id) => flagLabelById.get(id))
    .filter((l): l is string => Boolean(l))
    .join(", ");
  return [
    r.name,
    r.code ?? "",
    r.locationStatus ? STORE_STATUS_META[r.locationStatus].label : "",
    r.reAgent ? RE_AGENT_LABEL[r.reAgent] : "",
    flagLabels,
    r.newco?.entitaCeip1 ?? "",
    r.newco?.entitaCeip2 ?? "",
    bp ? bp.label : "",
    r.newco?.operationalType ?? "",
    r.category ? CATEGORY_LABEL[r.category] : "",
    redFlagExport(r),
    r.franchiseContractId ? "Podepsáno" : "Ne",
    LEASE_HOLDER_LABEL[r.leaseCurrent],
    LEASE_HOLDER_LABEL[r.leaseTarget],
    RECON_META[reconcile(r.leaseCurrent, r.leaseTarget)].label,
    r.hasNewco ? "Ano" : "Ne",
    r.note ?? "",
  ];
}

// Sestaví .xlsx (Uint8Array) z předaných řádků - voláno z tabulky s aktuálně
// zobrazenou (filtrovanou + seřazenou) sadou řádků. flagLabelById mapuje id flagů
// na jejich názvy (řádek drží jen flagIds, katalog je vedle).
export async function buildRealEstateXlsx(
  rows: RealEstateRow[],
  flagLabelById: Map<string, string>,
): Promise<Uint8Array> {
  const sheet: XlsxSheet = {
    name: "Real Estate",
    columns: COLUMNS,
    rows: rows.map((r) => rowCells(r, flagLabelById)),
  };
  return buildXlsx([sheet]);
}
