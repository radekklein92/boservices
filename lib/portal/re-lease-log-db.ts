import { getRedis } from "@/lib/redis";
import type { LocationLocal, MirroredLocation } from "./locations-db";

// ─────────────────────────────────────────────────────────────────────────────
// Log změn Real Estate: pohyby, které hýbou počty Řešit/Vyřešeno/Červeně —
// nájem (lease_current_status / lease_target_status) A lokální příznaky nad
// červenou (solveDespiteRed = „Stejně řešit", manualRed = ruční „Červeně").
// Zrcadlo z Transition drží jen AKTUÁLNÍ stav nájmu (jedno updated_at/updated_by)
// — historii nikdo neukládal. Tenhle modul ji začne zaznamenávat: kdykoli se
// přepíše zrcadlo (write-through editace v tabulce, klik „Vyřešeno" v Telegramu,
// hodinový full-replace sync nebo import skript), porovná se starý a nový nájem
// a každá změna se zaloguje. Příznaky se diffují v patchLocationLocal.
//
// Záměrně jediný společný chokepoint = setMirroredLocation + replaceMirroredLocations
// (lib/portal/locations-db.ts). Všechny zápisové cesty jím procházejí, takže log
// chytí změnu bez ohledu na zdroj. Kdo/kdy bereme z nového záznamu (updated_by/
// updated_at), který Transition stamuje — pro write-through i sync je to autor
// poslední změny.
//
// Úložiště: jeden globální Redis list (newest-first, LPUSH + LTRIM), jako
// portal:digisign:webhook:log. Log NIKDY neshodí zápis zrcadla — appendLeaseChanges
// polyká vlastní chyby.
// ─────────────────────────────────────────────────────────────────────────────

const LOG_KEY = "portal:re-lease-log";
// Strop záznamů. Při ~desítkách změn nájmu týdně to drží historii na hodně dlouho.
const CAP = 4000;

// Typ události:
// - current/target = Nájem aktuálně / Nájem cílově (hodnota = LeaseStatus kód)
// - solveDespiteRed = „Stejně řešit navzdory červené" (hodnota = "on"/"off")
// - manualRed = ruční „Červeně" (hodnota = "on"/"off")
export type LeaseLogField = "current" | "target" | "solveDespiteRed" | "manualRed";

export interface LeaseLogEntry {
  // ISO čas změny (nájem: z MirroredLocation.updated_at; příznak: čas patche).
  at: string;
  // Kdo změnu provedl (e-mail, "telegram:Agent", "system:self-heal",
  // "import:google-sheet", "boservices:…").
  by: string;
  locationId: string;
  name: string;
  code: string | null;
  field: LeaseLogField;
  // Předchozí / nová hodnota. Nájem = LeaseStatus kód; příznak = "on"/"off".
  // from = null u záznamu bez předchozího stavu.
  from: string | null;
  to: string;
}

// Porovná starý a nový záznam a vrátí položky logu za změněná pole nájmu. Nová
// lokalita (old == null) se nezaznamenává — bez předchozího stavu to není „změna".
export function diffLeaseChanges(
  old: MirroredLocation | null | undefined,
  next: MirroredLocation,
): LeaseLogEntry[] {
  if (!old) return [];
  const out: LeaseLogEntry[] = [];
  const base = {
    at: next.updated_at || new Date().toISOString(),
    by: next.updated_by || "neznámý",
    locationId: next.id,
    name: next.name,
    code: next.code,
  };
  if (old.lease_current_status !== next.lease_current_status) {
    out.push({
      ...base,
      field: "current",
      from: old.lease_current_status,
      to: next.lease_current_status,
    });
  }
  if (old.lease_target_status !== next.lease_target_status) {
    out.push({
      ...base,
      field: "target",
      from: old.lease_target_status,
      to: next.lease_target_status,
    });
  }
  return out;
}

// Porovná staré a nové lokální příznaky (solveDespiteRed / manualRed) a vrátí
// položky logu za změněné příznaky. Volá patchLocationLocal po zápisu; name/code
// a kdo/kdy dodá volající (z mirroru a z patche). manualRed je {by,at}|null →
// pro log nás zajímá jen jeho přítomnost (on/off).
export function diffLocalFlagChanges(
  old: Pick<LocationLocal, "solveDespiteRed" | "manualRed"> | null | undefined,
  next: Pick<LocationLocal, "solveDespiteRed" | "manualRed">,
  meta: { locationId: string; name: string; code: string | null; at: string; by: string },
): LeaseLogEntry[] {
  const out: LeaseLogEntry[] = [];
  const oldSolve = Boolean(old?.solveDespiteRed);
  const nextSolve = Boolean(next.solveDespiteRed);
  if (oldSolve !== nextSolve) {
    out.push({ ...meta, field: "solveDespiteRed", from: oldSolve ? "on" : "off", to: nextSolve ? "on" : "off" });
  }
  const oldManual = Boolean(old?.manualRed);
  const nextManual = Boolean(next.manualRed);
  if (oldManual !== nextManual) {
    out.push({ ...meta, field: "manualRed", from: oldManual ? "on" : "off", to: nextManual ? "on" : "off" });
  }
  return out;
}

// Zaloguje předané změny (newest-first). Defenzivní: žádná chyba se nepropaguje
// ven, aby logování nikdy neshodilo zápis zrcadla ani sync.
export async function appendLeaseChanges(
  entries: ReadonlyArray<LeaseLogEntry>,
): Promise<void> {
  if (!entries.length) return;
  try {
    const r = getRedis();
    if (!r) return;
    const pipe = r.pipeline();
    // LPUSH v pořadí → newest skončí na začátku listu. Pushujeme od nejstarší
    // po nejnovější, takže výsledné pořadí listu je newest-first.
    for (const e of entries) pipe.lpush(LOG_KEY, JSON.stringify(e));
    pipe.ltrim(LOG_KEY, 0, CAP - 1);
    await pipe.exec();
  } catch {
    /* log je best-effort, nikdy nesmí shodit zápis zrcadla */
  }
}

// Spočítá diff a zaloguje. Helper, který volá datová vrstva po zápisu zrcadla.
export async function recordLeaseChanges(
  old: MirroredLocation | null | undefined,
  next: MirroredLocation,
): Promise<void> {
  await appendLeaseChanges(diffLeaseChanges(old, next));
}

// Přečte posledních `limit` záznamů logu (newest-first). @upstash/redis umí podle
// konfigurace vracet už deserializované objekty i raw stringy — zvládneme oboje.
export async function listLeaseLog(limit = 200): Promise<LeaseLogEntry[]> {
  const r = getRedis();
  if (!r) return [];
  const raw = (await r.lrange(LOG_KEY, 0, Math.max(0, limit - 1))) as unknown[];
  const out: LeaseLogEntry[] = [];
  for (const item of raw) {
    const parsed = parseEntry(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseEntry(item: unknown): LeaseLogEntry | null {
  let obj: unknown = item;
  if (typeof item === "string") {
    try {
      obj = JSON.parse(item);
    } catch {
      return null;
    }
  }
  if (
    obj &&
    typeof obj === "object" &&
    "locationId" in obj &&
    "field" in obj &&
    "to" in obj
  ) {
    return obj as LeaseLogEntry;
  }
  return null;
}
