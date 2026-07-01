// Stav POS filtru a jeho (de)serializace do URL + odvození datových oken.
// CLIENT-SAFE: žádné secrets, žádný server-only import - běží i v prohlížeči
// (PosFilterBar) i na serveru (RSC čte searchParams). Datum = kalendářní den
// (YYYY-MM-DD); "dnes" se počítá v časové zóně Europe/Prague.

import type { LocationConcept } from "@/lib/portal/locations-db";

// Výběr prodejen je MULTI-SELECT: množina konceptů (skupiny) ∪ množina lokalit.
// Prázdný výběr = "vše". Koncepty se drží symbolicky (zůstanou správné i po
// přidání prodejny). `locations` jsou tokeny - obvykle locationId, ale kvůli
// zpětné kompatibilitě a nenapárovaným pokladnám i:
//   - "shop:{dwShopId}"  konkrétní pokladna (nenapárovaná = vlastní pseudo-prodejna)
//   - "brand:{brandId}"  všechny pokladny značky (legacy ?scope=brand:)
//   - "city:{město}"     všechny pokladny města (legacy ?scope=city:)
// Resolver (selection.ts) tokeny rozloží na množinu dwShopId přes pairing index.
export interface PosSelection {
  concepts: LocationConcept[];
  locations: string[];
}

// Kódy konceptů (zrcadlo LocationConcept v locations-db.ts). Drženo lokálně,
// protože filters.ts musí být client-safe (nesmí tahat server kód z locations-db).
const CONCEPT_CODES: LocationConcept[] = [
  "TK",
  "KoP",
  "BB",
  "OXO",
  "RAK",
  "VD",
  "MFP",
  "KoFi",
  "Cinname",
  "Rio",
  "Pitstop",
  "other",
];
const CONCEPT_SET = new Set<string>(CONCEPT_CODES);

export type PosDatePreset =
  | "dnes"
  | "vcera"
  | "tento-tyden"
  | "minuly-tyden"
  | "tento-mesic"
  | "minuly-mesic"
  | "poslednich-30-dni"
  | "tento-rok"
  | "vlastni";

export interface PosFilter {
  selection: PosSelection;
  // Okruh prodejen ("store scope"): "bos" = jen BOS prodejny (DEFAULT), "all" = celá
  // síť. Sdílený toggle vedle výběru (jako měna CZK/EUR/PLN). Default BOS znamená, že
  // dashboard ukazuje jen BOS prodejny, dokud uživatel nepřepne na celou síť. Okruh
  // se aplikuje i na výběr konceptů/lokalit (resolver protne výběr s BOS množinou) a
  // omezuje obsah pickeru (loader). Single-location panely (detail lokality) si vynutí
  // "all", aby ne-BOS prodejna nevypadla.
  scope: "all" | "bos";
  preset: PosDatePreset;
  from?: string; // jen u preset "vlastni"
  to?: string;
  // Srovnání s předchozím obdobím je VŽDY zapnuté; baseline se odvodí automaticky
  // z presetu jako přirozené předchozí kalendářní období (viz resolveComparisonRange).
  // sameStore = volitelný filtr ŽEBŘÍČKU (skryje prodejny bez srovnatelného základu).
  // Na deltu KPI nemá vliv - ta je vždy like-for-like (viz getKpiSummary/computeLfl).
  sameStore: boolean;
  currency: string; // zobrazovací měna; default CZK; vše se do ní přepočítá přes FX (fx.ts)
  vatInclusive: boolean; // true = gross (s DPH), false = net (bez DPH)
}

export const EMPTY_SELECTION: PosSelection = { concepts: [], locations: [] };

export const DEFAULT_POS_FILTER: PosFilter = {
  selection: EMPTY_SELECTION,
  scope: "bos",
  preset: "tento-tyden",
  sameStore: false,
  currency: "CZK",
  vatInclusive: true,
};

// Prázdný výběr = "vše" (celá síť).
export function isAllSelection(s: PosSelection): boolean {
  return s.concepts.length === 0 && s.locations.length === 0;
}

export interface DateRange {
  from: string; // YYYY-MM-DD včetně
  to: string; // YYYY-MM-DD včetně
}

export const DATE_PRESET_LABEL: Record<PosDatePreset, string> = {
  dnes: "Dnes",
  vcera: "Včera",
  "tento-tyden": "Tento týden",
  "minuly-tyden": "Minulý týden",
  "tento-mesic": "Tento měsíc",
  "minuly-mesic": "Minulý měsíc",
  "poslednich-30-dni": "Posledních 30 dní",
  "tento-rok": "Tento rok",
  vlastni: "Vlastní",
};

// --- Pomocné funkce nad kalendářními daty (UTC midnight = čistý kalendářní den) ---

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

function startOfWeekMonday(s: string): string {
  const d = parseYmd(s);
  const dow = (d.getUTCDay() + 6) % 7; // Po=0 ... Ne=6
  d.setUTCDate(d.getUTCDate() - dow);
  return ymd(d);
}

function startOfMonth(s: string): string {
  const d = parseYmd(s);
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

function endOfMonth(s: string): string {
  const d = parseYmd(s);
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

function startOfYear(s: string): string {
  const d = parseYmd(s);
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), 0, 1)));
}

function daysInMonth(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

// Posun o N kalendářních měsíců. Den se clampuje na poslední den cílového měsíce
// (31.3 -> 28./29.2). Date.UTC normalizuje přetečení indexu měsíce (i přes rok).
function shiftMonths(s: string, n: number): string {
  const d = parseYmd(s);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const ty = Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const tday = Math.min(d.getUTCDate(), daysInMonth(ty, tm));
  return ymd(new Date(Date.UTC(ty, tm, tday)));
}

// Posun o N kalendářních roků (29.2 -> 28.2 v nepřestupném roce).
function shiftYears(s: string, n: number): string {
  return shiftMonths(s, n * 12);
}

// Počet dní okna včetně obou krajů.
export function inclusiveDays(range: DateRange): number {
  return Math.round((parseYmd(range.to).getTime() - parseYmd(range.from).getTime()) / 86400000) + 1;
}

// Dnešní kalendářní den v Europe/Prague jako YYYY-MM-DD.
export function todayPrague(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Vyřeší filtr na konkrétní datové okno (včetně obou krajů). `today` lze předat
// pro testovatelnost; default = dnešek v Praze.
export function resolveDateRange(filter: PosFilter, today: string = todayPrague()): DateRange {
  switch (filter.preset) {
    case "dnes":
      return { from: today, to: today };
    case "vcera": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "tento-tyden":
      return { from: startOfWeekMonday(today), to: today };
    case "minuly-tyden": {
      const lastMon = addDays(startOfWeekMonday(today), -7);
      return { from: lastMon, to: addDays(lastMon, 6) };
    }
    case "tento-mesic":
      return { from: startOfMonth(today), to: today };
    case "minuly-mesic": {
      const prev = startOfMonth(addDays(startOfMonth(today), -1));
      return { from: prev, to: endOfMonth(prev) };
    }
    case "poslednich-30-dni":
      return { from: addDays(today, -29), to: today };
    case "tento-rok":
      return { from: startOfYear(today), to: today };
    case "vlastni":
      return { from: filter.from ?? today, to: filter.to ?? today };
  }
}

// True, když se filtr resolvuje na jediný kalendářní den (dnes/včera/vlastní 1 den).
// Takové zobrazení má smysl kreslit hodinovým grafem (24 bodů), ne jedním denním bodem.
export function isSingleDay(filter: PosFilter, today: string = todayPrague()): boolean {
  return inclusiveDays(resolveDateRange(filter, today)) === 1;
}

// Srovnávací okno (baseline). Srovnání je vždy zapnuté: baseline se odvodí z presetu
// jako PŘIROZENÉ PŘEDCHOZÍ KALENDÁŘNÍ období: den->předchozí den, týden->předchozí týden,
// měsíc->předchozí kalendářní měsíc (MTD vs MTD), rok->předchozí rok (YTD vs YTD).
// U "vlastni" dle délky okna L: do měsíce předchozí stejně dlouhé okno, nad měsíc předchozí
// rok. Pozn.: u dne/měsíce/roku se mohou rozjet dny v týdnu (záměr - kalendářní srovnání má
// přednost před weekday-alignmentem).
export function resolveComparisonRange(filter: PosFilter, range: DateRange): DateRange {
  const byDays = (n: number): DateRange => ({ from: addDays(range.from, -n), to: addDays(range.to, -n) });
  const byMonths = (n: number): DateRange => ({ from: shiftMonths(range.from, -n), to: shiftMonths(range.to, -n) });
  const byYears = (n: number): DateRange => ({ from: shiftYears(range.from, -n), to: shiftYears(range.to, -n) });
  switch (filter.preset) {
    case "dnes":
    case "vcera":
      return byDays(1);
    case "tento-tyden":
    case "minuly-tyden":
      return byDays(7);
    case "poslednich-30-dni":
      return byDays(30);
    case "tento-mesic":
    case "minuly-mesic":
      return byMonths(1);
    case "tento-rok":
      return byYears(1);
    case "vlastni": {
      const len = inclusiveDays(range);
      return len > 31 ? byYears(1) : byDays(len);
    }
    default: {
      const _exhaustive: never = filter.preset;
      return _exhaustive;
    }
  }
}

// Lidský popis srovnávacího období (do grafu i panelů). Odráží resolveComparisonRange.
const COMPARISON_LABEL_BY_PRESET: Record<PosDatePreset, string> = {
  dnes: "Předchozí den",
  vcera: "Předchozí den",
  "tento-tyden": "Předchozí týden",
  "minuly-tyden": "Předchozí týden",
  "tento-mesic": "Předchozí měsíc",
  "minuly-mesic": "Předchozí měsíc",
  "poslednich-30-dni": "Předchozích 30 dní",
  "tento-rok": "Předchozí rok",
  vlastni: "Předchozí období",
};

export function comparisonLabel(filter: PosFilter): string {
  if (filter.preset === "vlastni") {
    return inclusiveDays(resolveDateRange(filter)) > 31 ? "Předchozí rok" : "Předchozí období";
  }
  return COMPARISON_LABEL_BY_PRESET[filter.preset];
}

// --- (De)serializace výběru ---

function decodeConcepts(raw: string | null): LocationConcept[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: LocationConcept[] = [];
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v && CONCEPT_SET.has(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v as LocationConcept);
    }
  }
  return out;
}

function decodeLocations(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// Zpětná kompatibilita: starý single-select ?scope=all|brand:x|shop:x|city:x.
// Mapuje se na tokeny v `locations`, které resolver rozloží přes pairing index.
function decodeLegacyScope(raw: string | null): PosSelection | null {
  if (!raw) return null;
  if (raw === "all") return EMPTY_SELECTION;
  const idx = raw.indexOf(":");
  if (idx === -1) return null;
  const kind = raw.slice(0, idx);
  const val = raw.slice(idx + 1);
  if (!val) return null;
  if (kind === "brand") return { concepts: [], locations: [`brand:${val}`] };
  if (kind === "shop") return { concepts: [], locations: [`shop:${val}`] };
  if (kind === "city") return { concepts: [], locations: [`city:${val}`] };
  return null;
}

// --- (De)serializace do/z URLSearchParams ---

const PRESETS = new Set<PosDatePreset>([
  "dnes",
  "vcera",
  "tento-tyden",
  "minuly-tyden",
  "tento-mesic",
  "minuly-mesic",
  "poslednich-30-dni",
  "tento-rok",
  "vlastni",
]);
export function parsePosFilter(sp: URLSearchParams): PosFilter {
  const presetRaw = sp.get("preset") as PosDatePreset | null;
  const preset = presetRaw && PRESETS.has(presetRaw) ? presetRaw : DEFAULT_POS_FILTER.preset;

  // Nový multi-select (c=, l=) má přednost; když chybí, zkus legacy ?scope=.
  const concepts = decodeConcepts(sp.get("c"));
  const locations = decodeLocations(sp.get("l"));
  let selection: PosSelection = { concepts, locations };
  if (concepts.length === 0 && locations.length === 0) {
    selection = decodeLegacyScope(sp.get("scope")) ?? EMPTY_SELECTION;
  }

  return {
    selection,
    // Okruh prodejen: ?stores=all = celá síť; cokoli jiného (vč. chybějícího) = BOS default.
    scope: sp.get("stores") === "all" ? "all" : "bos",
    preset,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    sameStore: sp.get("same") === "1",
    currency: sp.get("cur") || DEFAULT_POS_FILTER.currency,
    vatInclusive: sp.get("dph") !== "0", // default true
  };
}

// Pohodlný helper pro RSC: vezme Next `searchParams` (plain record) a vrátí filtr.
export function posFilterFromSearchParams(
  sp: Record<string, string | string[] | undefined>,
): PosFilter {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") usp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") usp.set(k, v[0]);
  }
  return parsePosFilter(usp);
}

// Serializuje jen ne-defaultní hodnoty -> krátké, čisté URL. Výběr: koncepty
// zkratkami (c=), lokality tokeny (l=). Prázdný výběr ("vše") se vynechává.
export function serializePosFilter(f: PosFilter): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.selection.concepts.length > 0) sp.set("c", f.selection.concepts.join(","));
  if (f.selection.locations.length > 0) sp.set("l", f.selection.locations.join(","));
  if (f.scope === "all") sp.set("stores", "all"); // default "bos" se vynechává (krátké URL)
  if (f.preset !== DEFAULT_POS_FILTER.preset) sp.set("preset", f.preset);
  if (f.preset === "vlastni") {
    if (f.from) sp.set("from", f.from);
    if (f.to) sp.set("to", f.to);
  }
  if (f.sameStore) sp.set("same", "1");
  if (f.currency !== DEFAULT_POS_FILTER.currency) sp.set("cur", f.currency);
  if (!f.vatInclusive) sp.set("dph", "0");
  return sp;
}
