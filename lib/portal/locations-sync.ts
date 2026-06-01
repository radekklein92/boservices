import { z } from "zod";
import {
  replaceMirroredLocations,
  setLocationsSyncMeta,
  type LocationsSyncMeta,
  type MirroredLocation,
} from "./locations-db";
import { bustLocations } from "./revalidate";

// Synchronizace lokalit z Transition. Sdílená logika pro cron
// (/api/cron/locations-sync) i manuální spuštění z portálu
// (/api/portal/locations/sync). Vrací výsledek + zapisuje sync-meta.

export type SyncOutcome =
  | { ok: true; synced: number; removed: number; durationMs: number }
  | { ok: false; reason: "not-configured" | "error"; error: string; durationMs: number };

// Tolerantní schéma: enumy přijímáme jako string (Transition je zdroj pravdy,
// nechceme sync shodit kvůli nové hodnotě, kterou tu ještě nemáme v unionu).
// Jen ověříme, že přišel objekt s povinným id/name/concept.
const locationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    concept: z.string(),
  })
  .passthrough();

const responseSchema = z.object({
  ok: z.literal(true),
  count: z.number().optional(),
  locations: z.array(locationSchema),
});

export async function runLocationsSync(source: string): Promise<SyncOutcome> {
  const startedAt = Date.now();
  const baseUrl = process.env.TRANSITION_LOCATIONS_URL;
  const token = process.env.TRANSITION_API_TOKEN;

  if (!baseUrl || !token) {
    const durationMs = Date.now() - startedAt;
    // Čistý no-op (jako blob-backup), dokud není integrace nastavená.
    return {
      ok: false,
      reason: "not-configured",
      error: "TRANSITION_LOCATIONS_URL nebo TRANSITION_API_TOKEN není nastaven.",
      durationMs,
    };
  }

  try {
    const res = await fetch(baseUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Transition API vrátilo ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error("Neočekávaný tvar odpovědi z Transition API.");
    }

    // Cast je bezpečný: ukládáme přesně to, co Transition poslal (passthrough).
    const locations = parsed.data.locations as unknown as MirroredLocation[];
    const { synced, removed } = await replaceMirroredLocations(locations);

    const durationMs = Date.now() - startedAt;
    const meta: LocationsSyncMeta = {
      lastSyncAt: new Date().toISOString(),
      ok: true,
      synced,
      removed,
      durationMs,
      source,
    };
    await setLocationsSyncMeta(meta);
    bustLocations();

    return { ok: true, synced, removed, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const error = err instanceof Error ? err.message : String(err);
    const meta: LocationsSyncMeta = {
      lastSyncAt: new Date().toISOString(),
      ok: false,
      synced: 0,
      removed: 0,
      durationMs,
      source,
      error,
    };
    await setLocationsSyncMeta(meta);
    return { ok: false, reason: "error", error, durationMs };
  }
}
