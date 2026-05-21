import { getRedis } from "@/lib/redis";
import type {
  ClaimBundleSectionType,
  ContractType,
  ContractVariant,
} from "./contract-types";

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

export const CONTRACT_STATUSES: ContractStatus[] = [
  "koncept",
  "schvaleno",
  "k-podpisu",
  "podepsano-bos",
  "podepsano-klientem",
  "archivovano",
];

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

export function computeContractStatus(
  c: Pick<
    Contract,
    | "approvedAt"
    | "signerPickedAt"
    | "signedAt"
    | "clientSignedAt"
    | "scanUploadedAt"
  >,
): ContractStatus {
  if (c.scanUploadedAt) return "archivovano";
  if (c.clientSignedAt) return "podepsano-klientem";
  if (c.signedAt) return "podepsano-bos";
  if (c.signerPickedAt) return "k-podpisu";
  if (c.approvedAt) return "schvaleno";
  return "koncept";
}

const INDEX = "portal:contracts:index";
const contractKey = (id: string) => `portal:contract:${id}`;
const byClientKey = (clientId: string) =>
  `portal:contracts:by-client:${clientId}`;
const byTypeKey = (type: ContractType) => `portal:contracts:by-type:${type}`;

// Lazy migrace: starý záznam má status z {draft, generated, signed, picked-up,
// archived} a pole pickedUpAt místo clientSignedAt. Doplníme nové timestamps
// z těch existujících (1:1 mapování dle dohody) a status vždy přepočítáme.
function migrateContract(raw: Contract | null): Contract | null {
  if (!raw) return null;
  // Cast přes any kvůli starým polím, která už nejsou v typu.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = raw as any;
  if (!c.approvedAt && (c.generatedAt || c.signedAt || c.scanUploadedAt || c.pickedUpAt)) {
    c.approvedAt = c.generatedAt ?? c.signedAt ?? c.pickedUpAt ?? c.scanUploadedAt;
  }
  if (!c.signerPickedAt && (c.signedAt || c.pickedUpAt || c.scanUploadedAt)) {
    c.signerPickedAt = c.signedAt ?? c.pickedUpAt ?? c.scanUploadedAt;
  }
  if (!c.clientSignedAt && (c.pickedUpAt || c.scanUploadedAt)) {
    c.clientSignedAt = c.pickedUpAt ?? c.scanUploadedAt;
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

export async function listContracts(): Promise<Contract[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.zrange<string[]>(INDEX, 0, -1, { rev: true })) ?? [];
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<Contract>(contractKey(id)));
  const results = (await pipe.exec()) as (Contract | null)[];
  return results
    .map(migrateContract)
    .filter((c): c is Contract => c !== null);
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
