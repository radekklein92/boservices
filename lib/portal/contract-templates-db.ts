import { getRedis } from "@/lib/redis";
import {
  CONTRACT_TYPE_META,
  CONTRACT_TYPES,
  type ContractType,
} from "./contract-types";
import { buildDefaultHtml } from "./default-templates";

export interface ContractTemplate {
  type: ContractType;
  name: string;
  html: string;
  updatedBy: string;
  updatedAt: string;
}

const templateKey = (type: ContractType) =>
  `portal:contract-template:${type}`;

export async function getContractTemplate(
  type: ContractType,
): Promise<ContractTemplate | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<ContractTemplate>(templateKey(type));
}

export async function getOrSeedContractTemplate(
  type: ContractType,
): Promise<ContractTemplate> {
  const existing = await getContractTemplate(type);
  if (existing) return existing;
  const meta = CONTRACT_TYPE_META[type];
  return {
    type,
    name: meta.fullName,
    html: buildDefaultHtml(type),
    updatedBy: "system",
    updatedAt: new Date().toISOString(),
  };
}

export async function upsertContractTemplate(
  template: ContractTemplate,
): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await r.set(templateKey(template.type), template);
}

export async function listContractTemplates(): Promise<
  Array<{
    type: ContractType;
    meta: (typeof CONTRACT_TYPE_META)[ContractType];
    template: ContractTemplate | null;
  }>
> {
  const r = getRedis();
  if (!r) {
    return CONTRACT_TYPES.map((type) => ({
      type,
      meta: CONTRACT_TYPE_META[type],
      template: null,
    }));
  }
  const pipe = r.pipeline();
  CONTRACT_TYPES.forEach((t) => pipe.get<ContractTemplate>(templateKey(t)));
  const results = (await pipe.exec()) as (ContractTemplate | null)[];
  return CONTRACT_TYPES.map((type, idx) => ({
    type,
    meta: CONTRACT_TYPE_META[type],
    template: results[idx] ?? null,
  }));
}
