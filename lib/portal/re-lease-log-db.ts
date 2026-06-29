import { getRedis } from "@/lib/redis";
import type { LeaseStatus, MirroredLocation } from "./locations-db";

// ─────────────────────────────────────────────────────────────────────────────
// Log změn nájmu (lease_current_status / lease_target_status). Zrcadlo z Transition
// drží jen AKTUÁLNÍ stav (jedno updated_at/updated_by) — historii nikdo neukládal.
// Tenhle modul ji začne zaznamenávat: kdykoli se přepíše zrcadlo (write-through
// editace v tabulce, klik „Vyřešeno" v Telegramu, hodinový full-replace sync nebo
// import skript), porovná se starý a nový nájem a každá změna se zaloguje.
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

export type LeaseLogField = "current" | "target";

export interface LeaseLogEntry {
  // ISO čas změny (z MirroredLocation.updated_at; fallback na čas zápisu).
  at: string;
  // Kdo změnu provedl (z MirroredLocation.updated_by — e-mail, "telegram:Agent",
  // "system:self-heal", "import:google-sheet"…).
  by: string;
  locationId: string;
  name: string;
  code: string | null;
  // Které pole se změnilo: "current" = Nájem aktuálně, "target" = Nájem cílově.
  field: LeaseLogField;
  from: LeaseStatus;
  to: LeaseStatus;
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
