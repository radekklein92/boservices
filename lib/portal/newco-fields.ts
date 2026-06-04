// Cílová pole NewCo importu + match-klíč (kód lokality). Sdílené mezi editorem
// mapování (UI) a importním API. Hodnota mapování = písmeno sloupce v XLSX
// (A, B, F, …) - stabilní pro čtení řádku (řádek je keyed písmenem sloupce).

export type NewCoFieldKey =
  | "entitaCeip1"
  | "entitaCeip2"
  | "field103"
  | "includeInBusinessPlan"
  | "operationalType"
  | "category";

export const NEWCO_FIELDS: Array<{ key: NewCoFieldKey; label: string }> = [
  { key: "entitaCeip1", label: "Entita CEIP #1" },
  { key: "entitaCeip2", label: "Entita CEIP #2" },
  { key: "field103", label: "103" },
  { key: "includeInBusinessPlan", label: "INCLUDE IN BUSINESS PLAN (Y/N)" },
  { key: "operationalType", label: "Operational type" },
  { key: "category", label: "Category" },
];

export type NewCoMapping = Record<NewCoFieldKey, string> & { code: string };

// Řádek je „označený červeně", když má aspoň tolik červeně vyplněných buněk.
export const NEWCO_RED_THRESHOLD = 5;

// Aliasy hlaviček pro auto-předvyplnění (case-insensitive „obsahuje").
const FIELD_ALIASES: Record<NewCoFieldKey | "code", string[]> = {
  entitaCeip1: ["entita ceip #1", "entita ceip 1", "ceip #1"],
  entitaCeip2: ["entita ceip #2", "entita ceip 2", "ceip #2"],
  field103: ["103"],
  includeInBusinessPlan: ["include in business plan", "business plan"],
  operationalType: ["operational type"],
  category: ["category"],
  code: ["kód", "kod", "code", "brandcode"],
};

export type XlsxColumn = { letter: string; label: string };

function matchAlias(aliases: string[], columns: XlsxColumn[]): string {
  for (const col of columns) {
    const lbl = col.label.toLowerCase().trim();
    if (lbl && aliases.some((a) => lbl.includes(a))) return col.letter;
  }
  return "";
}

// Navrhne mapování: nejdřív podle aliasu hlavičky (odolné vůči změně pořadí),
// jinak z uloženého mapování (pokud daný sloupec stále existuje) - kvůli
// bezhlavičkovým sloupcům jako „103".
export function suggestNewCoMapping(
  columns: XlsxColumn[],
  saved: Partial<NewCoMapping> | null,
): NewCoMapping {
  const exists = (letter: string) =>
    !!letter && columns.some((c) => c.letter === letter);
  const pick = (key: NewCoFieldKey | "code"): string => {
    const byAlias = matchAlias(FIELD_ALIASES[key], columns);
    if (byAlias) return byAlias;
    const savedLetter = saved?.[key];
    return savedLetter && exists(savedLetter) ? savedLetter : "";
  };
  return {
    entitaCeip1: pick("entitaCeip1"),
    entitaCeip2: pick("entitaCeip2"),
    field103: pick("field103"),
    includeInBusinessPlan: pick("includeInBusinessPlan"),
    operationalType: pick("operationalType"),
    category: pick("category"),
    code: pick("code"),
  };
}
