import { getRedis } from "@/lib/redis";
import {
  CONTRACT_TYPE_META,
  CONTRACT_TYPES,
  getVariantsForType,
  hasVariants,
  isBundleType,
  type ContractType,
  type ContractVariant,
} from "./contract-types";

// Bundle (claim-bundle) nemá vlastní šablonu - skládá se ze 3 zdrojových šablon
// (claim-assignment, side-fee, assignment-notice), které admin edituje samostatně.
const EDITABLE_TYPES = CONTRACT_TYPES.filter((t) => !isBundleType(t));
import { buildDefaultHtml } from "./default-templates";

export interface ContractTemplate {
  type: ContractType;
  variant?: ContractVariant;
  name: string;
  html: string;
  updatedBy: string;
  updatedAt: string;
}

const templateKey = (type: ContractType, variant?: ContractVariant) =>
  hasVariants(type) && variant
    ? `portal:contract-template:${type}:${variant}`
    : `portal:contract-template:${type}`;

export async function getContractTemplate(
  type: ContractType,
  variant?: ContractVariant,
): Promise<ContractTemplate | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<ContractTemplate>(templateKey(type, variant));
}

export async function getOrSeedContractTemplate(
  type: ContractType,
  variant?: ContractVariant,
): Promise<ContractTemplate> {
  const existing = await getContractTemplate(type, variant);
  if (existing) return existing;
  const meta = CONTRACT_TYPE_META[type];
  return {
    type,
    variant: hasVariants(type) ? variant : undefined,
    name: meta.fullName,
    html: buildDefaultHtml(type, variant),
    updatedBy: "system",
    updatedAt: new Date().toISOString(),
  };
}

export async function upsertContractTemplate(
  template: ContractTemplate,
): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await r.set(templateKey(template.type, template.variant), template);
}

// Smaže uloženou šablonu z Redisu - příští getOrSeedContractTemplate vrátí
// čistý default z buildDefaultHtml(). Používá se pro „reset na výchozí".
export async function deleteContractTemplate(
  type: ContractType,
  variant?: ContractVariant,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.del(templateKey(type, variant));
}

export type TemplateListEntry = {
  type: ContractType;
  meta: (typeof CONTRACT_TYPE_META)[ContractType];
  template: ContractTemplate | null;
  variants?: Array<{
    variant: ContractVariant;
    template: ContractTemplate | null;
  }>;
};

export async function listContractTemplates(): Promise<TemplateListEntry[]> {
  const r = getRedis();
  if (!r) {
    return EDITABLE_TYPES.map((type) => ({
      type,
      meta: CONTRACT_TYPE_META[type],
      template: null,
      variants: hasVariants(type)
        ? getVariantsForType(type).map((v) => ({
            variant: v as ContractVariant,
            template: null,
          }))
        : undefined,
    }));
  }

  const pipe = r.pipeline();
  const keys: Array<{ type: ContractType; variant?: ContractVariant }> = [];

  for (const type of EDITABLE_TYPES) {
    if (hasVariants(type)) {
      for (const v of getVariantsForType(type)) {
        keys.push({ type, variant: v as ContractVariant });
        pipe.get<ContractTemplate>(templateKey(type, v as ContractVariant));
      }
    } else {
      keys.push({ type });
      pipe.get<ContractTemplate>(templateKey(type));
    }
  }

  const results = (await pipe.exec()) as (ContractTemplate | null)[];

  return EDITABLE_TYPES.map((type) => {
    const meta = CONTRACT_TYPE_META[type];
    if (hasVariants(type)) {
      const variants = getVariantsForType(type).map((v) => {
        const variant = v as ContractVariant;
        const idx = keys.findIndex(
          (k) => k.type === type && k.variant === variant,
        );
        return {
          variant,
          template: idx >= 0 ? (results[idx] ?? null) : null,
        };
      });
      return {
        type,
        meta,
        template: variants[0]?.template ?? null,
        variants,
      };
    }
    const idx = keys.findIndex((k) => k.type === type && !k.variant);
    return {
      type,
      meta,
      template: idx >= 0 ? (results[idx] ?? null) : null,
    };
  });
}
