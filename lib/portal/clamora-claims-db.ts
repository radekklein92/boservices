import { getRedis } from "@/lib/redis";
import type { ClaimItem } from "./claims";

// Zrcadlo postoupených pohledávek z ClamoraPortal (read-only). ClamoraPortal je
// samostatný portál s vlastní Redis databází; tahle vrstva drží snímek jeho
// claim-bundle smluv podepsaných klientem, který sem hodinově syncuje
// clamora-claims-sync (stejný pattern jako zrcadlení lokalit z Transition).
//
// Na rozdíl od lokalit nemají tato data lokální nadstavbu - cross-ručení žije ve
// sdíleném claims-overlay a váže se přes claimKey (prefix „clamora:"), takže
// stačí jeden snapshot blob a full-replace při každém syncu.

export interface MirroredClamoraContract {
  contractId: string;
  contractNumber?: string | null;
  debtorName?: string | null;
  debtorIco?: string | null;
  clientName?: string | null; // postupitel
  creditorName?: string | null; // postupník (Clamora Bridge s.r.o.)
  contractDate?: string | null;
  digisignClientSignedAt?: string | null;
  status?: string;
  items: ClaimItem[];
}

export interface ClamoraClaimsSnapshot {
  syncedAt: string;
  contracts: MirroredClamoraContract[];
}

export interface ClamoraClaimsSyncMeta {
  lastSyncAt: string;
  ok: boolean;
  synced: number; // počet zrcadlených smluv
  durationMs: number;
  source: string;
  error?: string;
}

const DATA_KEY = "portal:clamora-claims:data";
const SYNC_META_KEY = "portal:clamora-claims:sync-meta";

export async function getClamoraClaims(): Promise<MirroredClamoraContract[]> {
  const r = getRedis();
  if (!r) return [];
  const snap = await r.get<ClamoraClaimsSnapshot>(DATA_KEY);
  return snap?.contracts ?? [];
}

// Full-replace sync: přepíše celý snímek tím, co přišlo z ClamoraPortal.
export async function replaceClamoraClaims(
  contracts: MirroredClamoraContract[],
): Promise<{ synced: number }> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const snapshot: ClamoraClaimsSnapshot = {
    syncedAt: new Date().toISOString(),
    contracts,
  };
  await r.set(DATA_KEY, snapshot);
  return { synced: contracts.length };
}

export async function getClamoraClaimsSyncMeta(): Promise<ClamoraClaimsSyncMeta | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<ClamoraClaimsSyncMeta>(SYNC_META_KEY);
}

export async function setClamoraClaimsSyncMeta(
  meta: ClamoraClaimsSyncMeta,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.set(SYNC_META_KEY, meta);
}
