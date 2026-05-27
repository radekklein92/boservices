import { getRedis } from "@/lib/redis";
import type { ContractType } from "./contract-types";

export type LegalForm = "PO" | "FO";

export interface ClientAddress {
  street: string;
  city: string;
  zip: string;
  country?: string;
}

export interface ClientStatutory {
  name: string;
  role?: string;
}

export interface ClientContact {
  name?: string;
  email?: string;
  phone?: string;
}

export interface Client {
  id: string;
  legalForm: LegalForm;
  companyName: string;
  ico?: string;
  dic?: string;
  address: ClientAddress;
  statutory?: ClientStatutory;
  contact?: ClientContact;
  // Plánované smlouvy - počet kusů každého typu, který chceme s klientem
  // podepsat (klient může mít víc prodejen => víc smluv jednoho typu).
  // Legacy data mohou být pole typů - normalizuje se přes normalizePlanned().
  plannedContracts?: Partial<Record<ContractType, number>>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const INDEX_KEY = "portal:clients:index";
const clientKey = (id: string) => `portal:client:${id}`;
const byIcoKey = (ico: string) => `portal:clients:by-ico:${ico}`;

export async function getClient(id: string): Promise<Client | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<Client>(clientKey(id));
}

export async function getClientByIco(ico: string): Promise<Client | null> {
  const r = getRedis();
  if (!r || !ico) return null;
  const id = await r.get<string>(byIcoKey(ico));
  if (!id) return null;
  return getClient(id);
}

export async function upsertClient(client: Client): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const score = new Date(client.createdAt).getTime();
  const ops: Promise<unknown>[] = [
    r.set(clientKey(client.id), client),
    r.zadd(INDEX_KEY, { score, member: client.id }),
  ];
  if (client.ico) ops.push(r.set(byIcoKey(client.ico), client.id));
  await Promise.all(ops);
}

export async function listClients(opts?: {
  limit?: number;
  offset?: number;
}): Promise<Client[]> {
  const r = getRedis();
  if (!r) return [];
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit;
  const stop = limit !== undefined ? offset + limit - 1 : -1;
  const ids = (await r.zrange<string[]>(INDEX_KEY, offset, stop, { rev: true })) ?? [];
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<Client>(clientKey(id)));
  const results = (await pipe.exec()) as (Client | null)[];
  return results.filter((c): c is Client => c !== null);
}

export async function countClients(): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  return (await r.zcard(INDEX_KEY)) ?? 0;
}

export async function deleteClient(id: string): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const client = await getClient(id);
  const ops: Promise<unknown>[] = [
    r.del(clientKey(id)),
    r.zrem(INDEX_KEY, id),
  ];
  if (client?.ico) ops.push(r.del(byIcoKey(client.ico)));
  await Promise.all(ops);
}
