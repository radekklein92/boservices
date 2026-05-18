import { getRedis } from "@/lib/redis";
import type { ContractType, FranchiseVariant } from "./contract-types";

export type ContractStatus =
  | "draft"
  | "generated"
  | "signed"
  | "picked-up"
  | "archived";

export interface Contract {
  id: string;
  type: ContractType;
  clientId: string;
  clientName: string;
  status: ContractStatus;
  html: string;
  // Snapshot HTML šablony v okamžiku vytvoření smlouvy - slouží pro diff
  // proti aktuálnímu znění (vidíme co user upravil)
  templateSnapshot?: string;
  // Varianta šablony - aktuálně pouze franchise (AB | B). Pro ostatní typy undefined.
  variant?: FranchiseVariant;
  variables: Record<string, string>;
  // PDF vygenerováno
  generatedPdfUrl?: string;
  generatedPdfPath?: string;
  generatedAt?: string;
  // Podepsáno jednateli (manuální milestone)
  signedAt?: string;
  signedBy?: string;
  // Vyzvednuto obchodníkem (manuální milestone)
  pickedUpAt?: string;
  pickedUpBy?: string;
  // Naskenovaná podepsaná kopie
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
    "generatedAt" | "signedAt" | "pickedUpAt" | "scanUploadedAt"
  >,
): ContractStatus {
  if (c.scanUploadedAt) return "archived";
  if (c.pickedUpAt) return "picked-up";
  if (c.signedAt) return "signed";
  if (c.generatedAt) return "generated";
  return "draft";
}

const INDEX = "portal:contracts:index";
const contractKey = (id: string) => `portal:contract:${id}`;
const byClientKey = (clientId: string) =>
  `portal:contracts:by-client:${clientId}`;
const byTypeKey = (type: ContractType) => `portal:contracts:by-type:${type}`;

export async function getContract(id: string): Promise<Contract | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<Contract>(contractKey(id));
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
  return results.filter((c): c is Contract => c !== null);
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
