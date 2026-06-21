// Výběry provize ("payouty") - obchodník (Toman/Ebermann) si vybere část své
// provize fakturací. Flow: podklad → fakturováno (faktura nahrána + AI ověřena)
// → zadáno k úhradě → uhrazeno. Redis-backed, vzor jako contracts-db / tasks-db.
//
// Částky jsou BEZ DPH (základ k fakturaci); pokud je obchodník plátce DPH,
// připočte si 21 % na faktuře (řeší podklad PDF + AI kontrola).

import { getRedis } from "@/lib/redis";
import type { SalespersonId } from "./commissions";

export type PayoutStatus =
  | "podklad"
  | "fakturovano"
  | "zadano-k-uhrade"
  | "uhrazeno";

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  podklad: "Čeká na fakturu",
  fakturovano: "Faktura ověřena",
  "zadano-k-uhrade": "Zadáno k úhradě",
  uhrazeno: "Uhrazeno",
};

// Tóny stavů (border+bg+text) - stejný recept jako stavy smluv.
export const PAYOUT_STATUS_STYLE: Record<PayoutStatus, string> = {
  podklad: "border-amber-300 bg-amber-50 text-amber-700",
  fakturovano: "border-sky-300 bg-sky-50 text-sky-700",
  "zadano-k-uhrade": "border-violet-300 bg-violet-50 text-violet-700",
  uhrazeno: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

// Dodavatel (obchodník / jeho firma) - snapshot na payoutu.
export interface PayoutBillingInfo {
  name: string;
  ico?: string;
  dic?: string;
  isVatPayer: boolean;
  address?: string;
  bankAccount?: string;
}

// Odběratel = plátce provize (BOServices entita) - snapshot.
export interface PayoutCustomerSnapshot {
  name: string;
  ico?: string;
  dic?: string;
  address?: string;
}

// Odběratel je vždy stejný - plátce provize. Snapshotuje se na payout při
// vytvoření (obchodník ho nezadává).
export const COMMISSION_PAYER: PayoutCustomerSnapshot = {
  name: "Business Operations Services s.r.o.",
  ico: "24520039",
  dic: "CZ24520039",
  address: "Uhelný trh 414/9, Staré Město, 110 00 Praha",
};

export interface PayoutAiCheck {
  ok: boolean;
  skipped?: boolean; // true = AI kontrola neproběhla (chybí klíč / chyba) → ruční ověření
  extractedAmount?: number;
  extractedVs?: string;
  reasons: string[];
  checkedAt: string;
}

export interface Payout {
  id: string;
  salespersonId: SalespersonId;
  merchantName: string; // snapshot jména obchodníka
  amount: number; // Kč BEZ DPH (základ k fakturaci)
  variableSymbol: string; // "2026/0001"
  status: PayoutStatus;
  billing: PayoutBillingInfo;
  customer: PayoutCustomerSnapshot;
  // Podklad PDF se generuje on-demand (GET .../podklad), neukládá se do Blobu.
  invoiceUrl?: string; // nahraná faktura (private Blob)
  invoicePath?: string;
  aiCheck?: PayoutAiCheck;
  createdBy: string; // email toho, kdo výběr vytvořil
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  paidBy?: string;
  // Poslední připomínka "Zadáno k úhradě déle než 48 h" (ISO). Kotva pro
  // opakování cronem; status route ji při každé změně stavu vyčistí.
  overdueRemindedAt?: string;
}

const INDEX = "portal:payouts:index";
const payoutKey = (id: string) => `portal:payout:${id}`;
const bySalespersonKey = (id: string) => `portal:payouts:by-salesperson:${id}`;

export function newPayoutId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `payout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getPayout(id: string): Promise<Payout | null> {
  const r = getRedis();
  if (!r) return null;
  return (await r.get<Payout>(payoutKey(id))) ?? null;
}

export async function listPayouts(): Promise<Payout[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.zrange<string[]>(INDEX, 0, -1, { rev: true })) ?? [];
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<Payout>(payoutKey(id)));
  const res = (await pipe.exec()) as (Payout | null)[];
  return res.filter((p): p is Payout => p !== null);
}

export async function listPayoutsBySalesperson(
  salespersonId: string,
): Promise<Payout[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.smembers(bySalespersonKey(salespersonId))) ?? [];
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<Payout>(payoutKey(id)));
  const res = (await pipe.exec()) as (Payout | null)[];
  return res
    .filter((p): p is Payout => p !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function upsertPayout(p: Payout): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const score = new Date(p.createdAt).getTime();
  await Promise.all([
    r.set(payoutKey(p.id), p),
    r.zadd(INDEX, { score, member: p.id }),
    r.sadd(bySalespersonKey(p.salespersonId), p.id),
  ]);
}

export async function deletePayout(id: string): Promise<Payout | null> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const p = await getPayout(id);
  if (!p) return null;
  await Promise.all([
    r.del(payoutKey(id)),
    r.zrem(INDEX, id),
    r.srem(bySalespersonKey(p.salespersonId), id),
  ]);
  return p;
}

export function sumPayouts(payouts: Payout[]): number {
  return payouts.reduce((s, p) => s + p.amount, 0);
}

// Kolik si obchodník ještě může vybrat = jeho provize (= total/2) mínus už
// vybráno (všechny jeho payouty bez ohledu na stav). Zdroj pravdy pro validaci.
export function salespersonAvailable(
  commission: number,
  payoutsForSalesperson: Payout[],
): number {
  return Math.max(
    0,
    Math.round(commission) - Math.round(sumPayouts(payoutsForSalesperson)),
  );
}

// Variabilní symbol: rok + 4místné pořadí (vzor getNextContractNumber).
export async function getNextPayoutVs(date = new Date()): Promise<string> {
  const r = getRedis();
  const year = date.getFullYear();
  if (!r) return `${year}/0001`;
  const next = await r.incr(`portal:payout-vs:${year}`);
  return `${year}/${String(next).padStart(4, "0")}`;
}
