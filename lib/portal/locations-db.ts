import { getRedis } from "@/lib/redis";
import type { NewCoMapping } from "./newco-fields";

// ─────────────────────────────────────────────────────────────────────────────
// Lokality = read-only zrcadlo z projektu Transition (zdroj pravdy). Synchronizuje
// se cronem přes /api/cron/locations-sync. Lokality se v BOServices NEvytváří ani
// needitují — pole z Transition jsou neměnná. Nad nimi držíme oddělená LOKÁLNÍ data
// (poznámky + přílohy), která sync nikdy nemaže.
//
// Typy MirroredLocation/enumy jsou záměrná kopie tvaru Transition Location
// (lib/types.ts). Projekty jsou oddělené — sdílíme data, ne kód. Když se model
// v Transition rozšíří, doplní se i tady (sync ukládá i neznámá pole, takže se
// data neztratí, jen se nezobrazí, dokud typ nedoplníme).
// ─────────────────────────────────────────────────────────────────────────────

export type LocationCategory = "core" | "nice" | "soso" | "trash" | "exit";

export type LocationConcept =
  | "TK"
  | "KoP"
  | "BB"
  | "OXO"
  | "RAK"
  | "VD"
  | "MFP"
  | "KoFi"
  | "Cinname"
  | "Rio"
  | "Pitstop"
  | "other";

export type LeaseStatus =
  | "uzavrena_na_twist"
  | "prepis_na_fransizanta"
  | "prepis_jinam"
  | "prepis_na_ceip"
  | "nemame_reseni"
  | "neznamy";

export type TransitionStatus =
  | "in_progress"
  | "hotovo"
  | "blocked"
  | "not_started";

export type ReAgent = "Krampera" | "Siarik" | "Kholova" | "Gransky" | "Neuzil";

export type LandlordAgreement =
  | "souhlasi"
  | "nesouhlasi"
  | "alternative"
  | "resime"
  | "zatim_nevime";

export type LocationStatus = "construction" | "open" | "closing" | "closed";
export type ClientStatus = "occupied" | "available" | "empty" | "assigned";
export type LocationMode = "franchise" | "operations" | "full";

// Tvar 1:1 s Transition Location. `string | null` zachováno, ať se zrcadlo
// nerozejde s originálem a šlo snadno diffovat.
export interface MirroredLocation {
  id: string;
  code: string | null;
  name: string;
  concept: LocationConcept;
  category: LocationCategory | null;
  in_new_twist: boolean;

  lease_current_status: LeaseStatus;
  lease_target_status: LeaseStatus;
  exception_approved_by: string | null;
  responsible: string | null;
  transition_status: TransitionStatus;
  note: string;
  op_2026: number;
  target_franchisee: string | null;

  re_agent: ReAgent | null;
  landlord_agreement: LandlordAgreement | null;
  landlord_agreement_raw: string | null;
  surcharge_amount: number;
  re_status_note: string;
  next_step: string;
  client_ico: string;
  eviction_risk: boolean;
  re_active: boolean;
  closing_date: string | null;
  opening_date: string | null;
  location_status: LocationStatus | null;
  client_status: ClientStatus | null;
  client_status_reason: string | null;
  overcrowded_client_count: number | null;
  new_deal_id: string | null;
  new_client_id: string | null;
  new_client_name: string | null;
  current_mode: LocationMode | null;
  new_mode: LocationMode | null;
  new_mode_start_date: string | null;

  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

// ── Lokální nadstavba (žije jen v BOServices, sync se jí nedotýká) ─────────────

export interface LocationAttachment {
  id: string;
  name: string;
  url: string;
  pathname: string;
  size: number;
  contentType: string;
  uploadedBy: string;
  uploadedAt: string;
}

// Data importovaná z NewCo XLSX (per lokalita, párováno přes kód). Hodnoty
// jako string (obsah buněk). flaggedRed = řádek měl >= 5 červených buněk.
export interface LocationNewCo {
  entitaCeip1: string;
  entitaCeip2: string;
  field103: string;
  includeInBusinessPlan: string;
  operationalType: string;
  category: string;
  flaggedRed: boolean;
  importedBy: string;
  importedAt: string;
}

export interface LocationLocal {
  locationId: string;
  note: string;
  attachments: LocationAttachment[];
  newco?: LocationNewCo;
  updatedBy: string;
  updatedAt: string;
}

// Spojený pohled pro detail.
export interface LocationView extends MirroredLocation {
  local: LocationLocal | null;
}

export interface LocationsSyncMeta {
  lastSyncAt: string;
  ok: boolean;
  synced: number;
  removed: number;
  durationMs: number;
  source: string;
  error?: string;
}

const ALL_KEY = "portal:locations:all";
const locKey = (id: string) => `portal:tlocation:${id}`;
const localKey = (id: string) => `portal:location-local:${id}`;
const SYNC_META_KEY = "portal:locations:sync-meta";

function byName(a: MirroredLocation, b: MirroredLocation): number {
  return a.name.localeCompare(b.name, "cs");
}

export async function listLocations(): Promise<MirroredLocation[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.smembers(ALL_KEY)) as string[];
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<MirroredLocation>(locKey(id)));
  const results = (await pipe.exec()) as (MirroredLocation | null)[];
  return results.filter((l): l is MirroredLocation => l !== null).sort(byName);
}

export async function getLocation(id: string): Promise<LocationView | null> {
  const r = getRedis();
  if (!r) return null;
  const [loc, local] = await Promise.all([
    r.get<MirroredLocation>(locKey(id)),
    r.get<LocationLocal>(localKey(id)),
  ]);
  if (!loc) return null;
  return { ...loc, local: local ?? null };
}

// Full-replace sync: uloží všechny příchozí lokality a smaže ty, které už
// v Transition nejsou. Lokální data (poznámky/přílohy) zůstávají nedotčená —
// klíčujeme je per location id, takže přežijí i odebrání lokality ze zrcadla
// (a vrátí se, kdyby se lokalita objevila znovu).
export async function replaceMirroredLocations(
  locations: MirroredLocation[],
): Promise<{ synced: number; removed: number }> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");

  const oldIds = new Set((await r.smembers(ALL_KEY)) as string[]);
  const newIds = new Set(locations.map((l) => l.id));

  const writePipe = r.pipeline();
  for (const loc of locations) {
    writePipe.set(locKey(loc.id), loc);
    writePipe.sadd(ALL_KEY, loc.id);
  }
  let removed = 0;
  for (const id of oldIds) {
    if (!newIds.has(id)) {
      writePipe.del(locKey(id));
      writePipe.srem(ALL_KEY, id);
      removed++;
    }
  }
  // sadd/srem ve stejné dávce nevadí — pracují s různými id.
  if (locations.length || removed) await writePipe.exec();

  return { synced: locations.length, removed };
}

// ── Lokální data ──────────────────────────────────────────────────────────────

export async function getLocationLocal(id: string): Promise<LocationLocal | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<LocationLocal>(localKey(id));
}

// Vrátí id lokalit, které mají nahranou aspoň jednu přílohu (nájemní smlouvu,
// dodatek, předávací protokol…). Slouží jako signál „má nahranou nájemní
// smlouvu" pro filtr v seznamu lokalit.
export async function listLocationIdsWithAttachments(): Promise<string[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.smembers(ALL_KEY)) as string[];
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<LocationLocal>(localKey(id)));
  const results = (await pipe.exec()) as (LocationLocal | null)[];
  const out: string[] = [];
  results.forEach((local, i) => {
    if (local && local.attachments && local.attachments.length > 0) {
      out.push(ids[i]!);
    }
  });
  return out;
}

export async function saveLocationLocal(local: LocationLocal): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await r.set(localKey(local.locationId), local);
}

// Uloží NewCo data k lokalitě (zachová note/přílohy). Vrací false, pokud Redis
// není dostupný.
export async function setLocationNewCo(
  locationId: string,
  newco: LocationNewCo,
): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const existing = await r.get<LocationLocal>(localKey(locationId));
  const local: LocationLocal = existing
    ? { ...existing, newco, updatedBy: newco.importedBy, updatedAt: newco.importedAt }
    : {
        locationId,
        note: "",
        attachments: [],
        newco,
        updatedBy: newco.importedBy,
        updatedAt: newco.importedAt,
      };
  await r.set(localKey(locationId), local);
}

// Uložené mapování sloupců NewCo importu (předvyplnění editoru příště).
const NEWCO_MAPPING_KEY = "portal:locations:newco-mapping";

export async function getNewCoMapping(): Promise<NewCoMapping | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<NewCoMapping>(NEWCO_MAPPING_KEY);
}

export async function saveNewCoMapping(mapping: NewCoMapping): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.set(NEWCO_MAPPING_KEY, mapping);
}

// ── Sync meta ───────────────────────────────────────────────────────────────

export async function getLocationsSyncMeta(): Promise<LocationsSyncMeta | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<LocationsSyncMeta>(SYNC_META_KEY);
}

export async function setLocationsSyncMeta(meta: LocationsSyncMeta): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.set(SYNC_META_KEY, meta);
}
