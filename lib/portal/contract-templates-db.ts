import { getRedis } from "@/lib/redis";
import {
  CONTRACT_TYPE_META,
  CONTRACT_TYPES,
  type ContractType,
} from "./contract-types";

export interface ContractTemplate {
  type: ContractType;
  name: string;
  html: string;
  updatedBy: string;
  updatedAt: string;
}

const templateKey = (type: ContractType) =>
  `portal:contract-template:${type}`;

function defaultHtml(type: ContractType): string {
  const meta = CONTRACT_TYPE_META[type];
  return `<h1>${escape(meta.fullName)}</h1>
<p>uzavřená dnešního dne, měsíce a roku mezi smluvními stranami:</p>
<h2>Smluvní strany</h2>
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}, zastoupená {{clientStatutoryName}}, {{clientStatutoryRole}} (dále jen „Klient“);</p>
<p>a</p>
<p><strong>{{providerName}}</strong>, IČO: {{providerIco}}, se sídlem {{providerStreet}}, {{providerZip}} {{providerCity}}, zastoupená {{providerStatutoryName}}, {{providerStatutoryRole}} (dále jen „Poskytovatel“).</p>
<h2>1. Předmět smlouvy</h2>
<p>Doplňte předmět smlouvy.</p>
<h2>2. Práva a povinnosti smluvních stran</h2>
<p>Doplňte práva a povinnosti.</p>
<h2>3. Cena a platební podmínky</h2>
<p>Doplňte cenu a platební podmínky.</p>
<h2>4. Doba trvání smlouvy</h2>
<p>Doplňte ujednání o době trvání.</p>
<h2>5. Závěrečná ustanovení</h2>
<p>Tato smlouva je vyhotovena ve dvou stejnopisech, z nichž každá smluvní strana obdrží po jednom. Smlouva nabývá platnosti a účinnosti dnem podpisu oběma smluvními stranami.</p>
<p>V {{place}} dne {{contractDate}}.</p>
<p>__________________<br/>{{clientStatutoryName}}<br/>za Klienta</p>
<p>__________________<br/>{{providerStatutoryName}}<br/>za Poskytovatele</p>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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
    html: defaultHtml(type),
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
