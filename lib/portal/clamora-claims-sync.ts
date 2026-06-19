import { z } from "zod";
import {
  replaceClamoraClaims,
  setClamoraClaimsSyncMeta,
  type ClamoraClaimsSyncMeta,
  type MirroredClamoraContract,
} from "./clamora-claims-db";
import { bustClamoraClaims } from "./revalidate";

// Synchronizace postoupených pohledávek z ClamoraPortal (read-only zrcadlo).
// Sdílená logika pro cron (/api/cron/clamora-claims-sync) i manuální spuštění
// z portálu (/api/portal/claims/sync). Stejný recept jako runLocationsSync.

export type ClamoraSyncOutcome =
  | { ok: true; synced: number; durationMs: number }
  | {
      ok: false;
      reason: "not-configured" | "error";
      error: string;
      durationMs: number;
    };

// Tolerantní schéma: surová pole ClaimItem přijímáme přes passthrough
// (ClamoraPortal je zdroj pravdy, nechceme sync shodit kvůli novému poli).
// Ověříme jen contractId a že items je pole položek s id.
const itemSchema = z.object({ id: z.string() }).passthrough();
const contractSchema = z
  .object({
    contractId: z.string().min(1),
    items: z.array(itemSchema),
  })
  .passthrough();
const responseSchema = z.object({
  ok: z.literal(true),
  count: z.number().optional(),
  contracts: z.array(contractSchema),
});

export async function runClamoraClaimsSync(
  source: string,
): Promise<ClamoraSyncOutcome> {
  const startedAt = Date.now();
  const baseUrl = process.env.CLAMORA_CLAIMS_URL;
  const token = process.env.CLAMORA_PUBLIC_TOKEN;

  if (!baseUrl || !token) {
    const durationMs = Date.now() - startedAt;
    // Čistý no-op, dokud není integrace nastavená (jako locations-sync).
    return {
      ok: false,
      reason: "not-configured",
      error: "CLAMORA_CLAIMS_URL nebo CLAMORA_PUBLIC_TOKEN není nastaven.",
      durationMs,
    };
  }

  try {
    const res = await fetch(baseUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`ClamoraPortal API vrátilo ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error("Neočekávaný tvar odpovědi z ClamoraPortal API.");
    }

    // Cast je bezpečný: ukládáme přesně to, co ClamoraPortal poslal (passthrough).
    const contracts =
      parsed.data.contracts as unknown as MirroredClamoraContract[];
    const { synced } = await replaceClamoraClaims(contracts);

    const durationMs = Date.now() - startedAt;
    const meta: ClamoraClaimsSyncMeta = {
      lastSyncAt: new Date().toISOString(),
      ok: true,
      synced,
      durationMs,
      source,
    };
    await setClamoraClaimsSyncMeta(meta);
    bustClamoraClaims();

    return { ok: true, synced, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const error = err instanceof Error ? err.message : String(err);
    const meta: ClamoraClaimsSyncMeta = {
      lastSyncAt: new Date().toISOString(),
      ok: false,
      synced: 0,
      durationMs,
      source,
      error,
    };
    await setClamoraClaimsSyncMeta(meta);
    return { ok: false, reason: "error", error, durationMs };
  }
}
