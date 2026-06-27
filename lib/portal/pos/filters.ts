// Stav POS filtru a jeho (de)serializace do URL + odvození datových oken.
// CLIENT-SAFE: žádné secrets, žádný server-only import - běží i v prohlížeči
// (PosFilterBar) i na serveru (RSC čte searchParams). Datum = kalendářní den
// (YYYY-MM-DD); "dnes" se počítá v časové zóně Europe/Prague.

export type PosScope =
  | { kind: "all" }
  | { kind: "brand"; brandId: string }
  | { kind: "city"; city: string }
  | { kind: "shop"; shopId: string };

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

// predchozi-rok = posun o 364 dní (52 týdnů) -> zarovná dny v týdnu (lepší pro
// retail/food než kalendářní rok). predchozi-obdobi = stejně dlouhé okno těsně před.
export type PosComparison = "predchozi-obdobi" | "predchozi-rok" | "zadne";

export interface PosFilter {
  scope: PosScope;
  preset: PosDatePreset;
  from?: string; // jen u preset "vlastni"
  to?: string;
  comparison: PosComparison;
  sameStore: boolean; // like-for-like toggle
  currency: string; // segmentace per měna; default CZK; FX se nepřepočítává
  vatInclusive: boolean; // true = gross (s DPH), false = net (bez DPH)
}

export const DEFAULT_POS_FILTER: PosFilter = {
  scope: { kind: "all" },
  preset: "tento-tyden",
  comparison: "predchozi-rok",
  sameStore: false,
  currency: "CZK",
  vatInclusive: true,
};

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

export const COMPARISON_LABEL: Record<PosComparison, string> = {
  "predchozi-obdobi": "Předchozí období",
  "predchozi-rok": "Předchozí rok",
  zadne: "Bez srovnání",
};

// --- Pomocné funkce nad kalendářními daty (UTC midnight = čistý kalendářní den) ---

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(s: string, n: number): string {
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

// Srovnávací okno (baseline). null = bez srovnání.
export function resolveComparisonRange(filter: PosFilter, range: DateRange): DateRange | null {
  if (filter.comparison === "zadne") return null;
  if (filter.comparison === "predchozi-rok") {
    return { from: addDays(range.from, -364), to: addDays(range.to, -364) };
  }
  // predchozi-obdobi: stejně dlouhé okno končící den před začátkem aktuálního
  const len = inclusiveDays(range);
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(len - 1)), to };
}

// --- (De)serializace do/z URLSearchParams ---

function encodeScope(s: PosScope): string {
  switch (s.kind) {
    case "all":
      return "all";
    case "brand":
      return `brand:${s.brandId}`;
    case "city":
      return `city:${s.city}`;
    case "shop":
      return `shop:${s.shopId}`;
  }
}

function decodeScope(raw: string | null): PosScope {
  if (!raw || raw === "all") return { kind: "all" };
  const idx = raw.indexOf(":");
  if (idx === -1) return { kind: "all" };
  const kind = raw.slice(0, idx);
  const val = raw.slice(idx + 1);
  if (!val) return { kind: "all" };
  if (kind === "brand") return { kind: "brand", brandId: val };
  if (kind === "city") return { kind: "city", city: val };
  if (kind === "shop") return { kind: "shop", shopId: val };
  return { kind: "all" };
}

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
const COMPARISONS = new Set<PosComparison>(["predchozi-obdobi", "predchozi-rok", "zadne"]);

export function parsePosFilter(sp: URLSearchParams): PosFilter {
  const presetRaw = sp.get("preset") as PosDatePreset | null;
  const preset = presetRaw && PRESETS.has(presetRaw) ? presetRaw : DEFAULT_POS_FILTER.preset;
  const cmpRaw = sp.get("cmp") as PosComparison | null;
  const comparison = cmpRaw && COMPARISONS.has(cmpRaw) ? cmpRaw : DEFAULT_POS_FILTER.comparison;
  return {
    scope: decodeScope(sp.get("scope")),
    preset,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    comparison,
    sameStore: sp.get("same") === "1",
    currency: sp.get("cur") || DEFAULT_POS_FILTER.currency,
    vatInclusive: sp.get("dph") !== "0", // default true
  };
}

// Serializuje jen ne-defaultní hodnoty -> krátké, čisté URL.
export function serializePosFilter(f: PosFilter): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.scope.kind !== "all") sp.set("scope", encodeScope(f.scope));
  if (f.preset !== DEFAULT_POS_FILTER.preset) sp.set("preset", f.preset);
  if (f.preset === "vlastni") {
    if (f.from) sp.set("from", f.from);
    if (f.to) sp.set("to", f.to);
  }
  if (f.comparison !== DEFAULT_POS_FILTER.comparison) sp.set("cmp", f.comparison);
  if (f.sameStore) sp.set("same", "1");
  if (f.currency !== DEFAULT_POS_FILTER.currency) sp.set("cur", f.currency);
  if (!f.vatInclusive) sp.set("dph", "0");
  return sp;
}
