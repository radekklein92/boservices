import { getRedis } from "@/lib/redis";
import type {
  ClaimBundleSectionType,
  ContractType,
  ContractVariant,
} from "./contract-types";
import type { ClaimItem } from "./claims";

// Status flow:
//   koncept → schvaleno → k-podpisu → podepsano-bos → podepsano-klientem → archivovano
// Status je computed z timestampů jednotlivých milestones (viz computeContractStatus).
// Každý milestone má samostatný POST/DELETE endpoint pro rollback (smazání timestampu
// vrátí smlouvu o status zpět).
export type ContractStatus =
  | "koncept"
  | "schvaleno"
  | "k-podpisu"
  | "podepsano-bos"
  | "podepsano-klientem"
  | "archivovano";

// Standardní flow (BOS podepisuje první, pak klient) - franšíza, provozování,
// spolupráce.
export const CONTRACT_STATUSES: ContractStatus[] = [
  "koncept",
  "schvaleno",
  "k-podpisu",
  "podepsano-bos",
  "podepsano-klientem",
  "archivovano",
];

// Postoupení pohledávek - opačné pořadí podpisů: nejdřív klient, pak BOS.
export const CLAIM_CONTRACT_STATUSES: ContractStatus[] = [
  "koncept",
  "schvaleno",
  "k-podpisu",
  "podepsano-klientem",
  "podepsano-bos",
  "archivovano",
];

// Odstoupení (a oznámení) - podepisuje jen klient/protistrana, přeskakuje se
// "Podepsáno BOS". "K podpisu" zůstává jako krok "připravit finální PDF".
export const WITHDRAWAL_CONTRACT_STATUSES: ContractStatus[] = [
  "koncept",
  "schvaleno",
  "k-podpisu",
  "podepsano-klientem",
  "archivovano",
];

export function getStatusFlowForType(type: ContractType): ContractStatus[] {
  if (type === "withdrawal" || type === "assignment-notice") {
    return WITHDRAWAL_CONTRACT_STATUSES;
  }
  if (
    type === "claim-bundle" ||
    type === "claim-assignment" ||
    type === "side-fee"
  ) {
    return CLAIM_CONTRACT_STATUSES;
  }
  return CONTRACT_STATUSES;
}

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  koncept: "Koncept",
  schvaleno: "Schváleno",
  "k-podpisu": "K podpisu",
  "podepsano-bos": "Podepsáno BOS",
  "podepsano-klientem": "Podepsáno klientem",
  archivovano: "Archivováno",
};

export function statusOrder(status: ContractStatus): number {
  return CONTRACT_STATUSES.indexOf(status);
}

export interface BundleSection {
  type: ClaimBundleSectionType;
  html: string;
  templateSnapshot: string;
}

export interface Contract {
  id: string;
  type: ContractType;
  clientId: string;
  clientName: string;
  status: ContractStatus;
  // Pro NE-bundle typy: aktuální HTML smlouvy. Pro bundle prázdné, obsah je
  // v bundleSections (každá sekce má vlastní HTML a snapshot).
  html: string;
  templateSnapshot?: string;
  // Bundle (claim-bundle): pole 3 sekcí s vlastním HTML a snapshotem šablony.
  bundleSections?: BundleSection[];
  // Varianta šablony - franchise (AB | B) nebo withdrawal (A | B). Pro typy
  // bez variant je undefined. Platné hodnoty určuje isValidVariantForType().
  variant?: ContractVariant;
  // Postoupení pohledávek (claim-assignment / claim-bundle): strukturovaný
  // seznam pohledávek pro Přílohu č. 1. Při generování PDF se z něj poskládá
  // tabulka ({{claimsTable}}) a součet ({{totalClaimsAmount}}, vč. DPH).
  claims?: ClaimItem[];
  // PDF s logem v záhlaví a textem v patičce (true, default) nebo bez nich.
  // Snapshot z template.letterhead při vytvoření smlouvy.
  letterhead?: boolean;
  variables: Record<string, string>;
  // PDF vygenerováno (preview nebo finální - rozhoduje status v okamžiku generace).
  generatedPdfUrl?: string;
  generatedPdfPath?: string;
  generatedAt?: string;
  // Schváleno: manažer prošel obsah a označil jako připravené k podpisu BOS.
  approvedAt?: string;
  approvedBy?: string;
  // Vybrán konkrétní Podepisující (User.email s isSigner=true). signerPickedAt
  // zároveň označuje přechod do statusu "k-podpisu" - finální PDF se generuje
  // až po této volbě (bez watermarku, s daty signera v providerStatutory1*).
  signerEmail?: string;
  signerPickedAt?: string;
  signerPickedBy?: string;
  // Podepsáno BOS (= podepisující fyzicky podepsal a označil)
  signedAt?: string;
  signedBy?: string;
  // Podepsáno klientem
  clientSignedAt?: string;
  clientSignedBy?: string;
  // Naskenovaná podepsaná kopie - spouští přechod do "archivovano"
  scanPdfUrl?: string;
  scanPdfPath?: string;
  scanUploadedAt?: string;
  scanUploadedBy?: string;
  number?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Mapuje status na timestamp pole, jehož vyplnění znamená "tento krok dokončen".
const STATUS_DONE_FIELD: Partial<
  Record<
    ContractStatus,
    "approvedAt" | "signerPickedAt" | "signedAt" | "clientSignedAt" | "scanUploadedAt"
  >
> = {
  schvaleno: "approvedAt",
  "k-podpisu": "signerPickedAt",
  "podepsano-bos": "signedAt",
  "podepsano-klientem": "clientSignedAt",
  archivovano: "scanUploadedAt",
};

// Status se počítá flow-driven: projde flow daného typu od konce a vrátí první
// status, jehož timestamp je vyplněný. Tím podporujeme různé pořadí podpisů
// (standard: BOS→klient, postoupení: klient→BOS, odstoupení: jen klient).
export function computeContractStatus(
  c: Pick<
    Contract,
    | "type"
    | "approvedAt"
    | "signerPickedAt"
    | "signedAt"
    | "clientSignedAt"
    | "scanUploadedAt"
  >,
): ContractStatus {
  const flow = getStatusFlowForType(c.type);
  for (let i = flow.length - 1; i >= 1; i--) {
    const status = flow[i]!;
    const field = STATUS_DONE_FIELD[status];
    if (field && c[field]) return status;
  }
  return "koncept";
}

const INDEX = "portal:contracts:index";
const contractKey = (id: string) => `portal:contract:${id}`;
const byClientKey = (clientId: string) =>
  `portal:contracts:by-client:${clientId}`;
const byTypeKey = (type: ContractType) => `portal:contracts:by-type:${type}`;

// Lazy migrace: starý záznam má status z {draft, generated, signed, picked-up,
// archived}. Doplníme nové timestamps z těch existujících (1:1 mapování dle
// dohody). DŮLEŽITÉ: gateujeme migraci přes status string - jakmile contract
// jednou prošel a má status z nové sady, NEbackfillujeme. Jinak by `approvedAt`
// znovu vyplýval z `generatedAt` po každém rollbacku ("Zrušit schválení").
const LEGACY_STATUSES = new Set([
  "draft",
  "generated",
  "signed",
  "picked-up",
  "archived",
]);

function migrateContract(raw: Contract | null): Contract | null {
  if (!raw) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = raw as any;
  const isLegacy = typeof c.status === "string" && LEGACY_STATUSES.has(c.status);
  if (isLegacy) {
    if (
      !c.approvedAt &&
      (c.generatedAt || c.signedAt || c.scanUploadedAt || c.pickedUpAt)
    ) {
      c.approvedAt = c.generatedAt ?? c.signedAt ?? c.pickedUpAt ?? c.scanUploadedAt;
    }
    if (!c.signerPickedAt && (c.signedAt || c.pickedUpAt || c.scanUploadedAt)) {
      c.signerPickedAt = c.signedAt ?? c.pickedUpAt ?? c.scanUploadedAt;
    }
    if (!c.clientSignedAt && (c.pickedUpAt || c.scanUploadedAt)) {
      c.clientSignedAt = c.pickedUpAt ?? c.scanUploadedAt;
    }
    delete c.pickedUpAt;
    delete c.pickedUpBy;
  }
  c.status = computeContractStatus(c);
  return c as Contract;
}

export async function getContract(id: string): Promise<Contract | null> {
  const r = getRedis();
  if (!r) return null;
  return migrateContract(await r.get<Contract>(contractKey(id)));
}

export async function upsertContract(contract: Contract): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const score = new Date(contract.createdAt).getTime();
  await Promise.all([
    r.set(contractKey(contract.id), contract),
    r.zadd(INDEX, { score, member: contract.id }),
    r.sadd(byClientKey(contract.clientId), contract.id),
    r.sadd(byTypeKey(contract.type), contract.id),
  ]);
}

// Volitelné limit/offset pro paginaci. Index je sorted set podle createdAt
// (descending = rev:true), takže offset 0 + limit 50 vrátí 50 nejnovějších.
// Bez parametrů = zachovává původní chování (vrátí všechno).
export async function listContracts(opts?: {
  limit?: number;
  offset?: number;
}): Promise<Contract[]> {
  const r = getRedis();
  if (!r) return [];
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit;
  const stop = limit !== undefined ? offset + limit - 1 : -1;
  const ids = (await r.zrange<string[]>(INDEX, offset, stop, { rev: true })) ?? [];
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<Contract>(contractKey(id)));
  const results = (await pipe.exec()) as (Contract | null)[];
  return results
    .map(migrateContract)
    .filter((c): c is Contract => c !== null);
}

// Celkový počet smluv (pro pagination metadata).
export async function countContracts(): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  return (await r.zcard(INDEX)) ?? 0;
}

export async function listContractsByClient(
  clientId: string,
): Promise<Contract[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.smembers(byClientKey(clientId))) ?? [];
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<Contract>(contractKey(id)));
  const results = (await pipe.exec()) as (Contract | null)[];
  return results
    .map(migrateContract)
    .filter((c): c is Contract => c !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getNextContractNumber(date = new Date()): Promise<string> {
  const r = getRedis();
  const year = date.getFullYear();
  if (!r) return `${year}/001`;
  const next = await r.incr(`portal:contract-seq:${year}`);
  return `${year}/${String(next).padStart(3, "0")}`;
}

export async function deleteContract(id: string): Promise<Contract | null> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const contract = await getContract(id);
  if (!contract) return null;
  await Promise.all([
    r.del(contractKey(id)),
    r.zrem(INDEX, id),
    r.srem(byClientKey(contract.clientId), id),
    r.srem(byTypeKey(contract.type), id),
  ]);
  return contract;
}
