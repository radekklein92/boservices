// Redis IO pro overlay vrstvu pohledávek. Jeden globální dokument (singleton) -
// data jsou globální, je jich málo (desítky položek) a editor je ukládá celá
// najednou (atomický full-replace). Stejný vzor jako portal:locations:sync-meta.

import { getRedis } from "@/lib/redis";
import { EMPTY_OVERLAY, type ClaimsOverlay } from "./claims-overlay";

const OVERLAY_KEY = "portal:claims-overlay";

// Vrací vždy ne-null ClaimsOverlay (EMPTY_OVERLAY je validní stav). Defenzivně
// doplní chybějící klíče, kdyby byl dokument uložen ze starší verze.
export async function getClaimsOverlay(): Promise<ClaimsOverlay> {
  const r = getRedis();
  if (!r) return EMPTY_OVERLAY;
  const doc = await r.get<ClaimsOverlay>(OVERLAY_KEY);
  return {
    manualClaims: doc?.manualClaims ?? [],
    guaranteesByClaimId: doc?.guaranteesByClaimId ?? {},
  };
}

export async function setClaimsOverlay(overlay: ClaimsOverlay): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await r.set(OVERLAY_KEY, overlay);
}
