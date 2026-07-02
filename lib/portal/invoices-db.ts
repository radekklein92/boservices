// Fakturace poplatků klientům (sekce Finance). Faktura = SNAPSHOT poplatků
// za uzavřený měsíc (Poplatky se počítají za běhu z feeTerms + tržeb DW a nikde
// jinde se neukládají) + fakturační údaje odběratele z entity Client. Flow:
// návrh (draft, bez čísla) → schváleno (approved = daňový doklad s číslem z
// nepřerušené roční řady). Redis-backed, vzor payouts-db.
//
// Částky položek jsou BEZ DPH (poplatky = základ daně); faktura vyčísluje
// DPH 21 % a celkem. Číslo se přiděluje AŽ při schválení (Stripe model) -
// návrhy jdou libovolně přegenerovat/zahodit bez děr v číselné řadě.

import { getRedis } from "@/lib/redis";
import { TONE_WARN, TONE_GOOD } from "./tone";
import type { ContractType } from "./contract-types";

export type InvoiceStatus = "draft" | "approved";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Návrh",
  approved: "Schváleno",
};

export const INVOICE_STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: TONE_WARN,
  approved: TONE_GOOD,
};

export const INVOICE_VAT_RATE = 0.21;

// Dodavatel na faktuře - Business Operations Services s.r.o. Snapshotuje se na
// fakturu (kdyby se v budoucnu měnil účet/sídlo, vystavené doklady zůstanou).
export interface InvoiceSupplier {
  name: string;
  ico: string;
  dic: string;
  address: string;
  bankAccount: string;
  iban: string;
  bic: string;
}

export const INVOICE_SUPPLIER: InvoiceSupplier = {
  name: "Business Operations Services s.r.o.",
  ico: "24520039",
  dic: "CZ24520039",
  address: "Uhelný trh 414/9, Staré Město, 110 00 Praha",
  bankAccount: "317497473/0300",
  iban: "CZ2203000000000317497473",
  bic: "CEKOCZPP",
};

// Odběratel - snapshot z entity Client v okamžiku generování návrhu.
export interface InvoiceCustomer {
  name: string;
  ico?: string;
  dic?: string;
  address?: string;
  email?: string; // pro pozdější rozesílání faktur
}

// Položka faktury = 1 řádek Poplatků (1 perioda 1 smlouvy) za fakturovaný měsíc.
export interface InvoiceItem {
  label: string; // periodLabel ("Průběžný franšízingový poplatek")
  description: string; // "Lokalita · Franšízingová smlouva · 5 % · 1.-30. 6. 2026 (30 dnů)"
  contractId: string;
  contractType: ContractType;
  periodId: string;
  locationId: string;
  locationName: string;
  amountBase: number; // bez DPH, zaokrouhleno na 2 des.
}

export interface InvoiceTotals {
  base: number; // základ daně
  vat: number; // DPH 21 %
  total: number; // celkem k úhradě
  vatRate: number; // 0.21 - snapshot sazby
}

export interface Invoice {
  // Deterministické: "inv-{month}-{clientId}-{currency}" → max 1 faktura na
  // (klient, měna, měsíc) strukturálně; regenerace je idempotentní upsert.
  id: string;
  month: string; // fakturované období "YYYY-MM"
  clientId: string;
  customer: InvoiceCustomer;
  supplier: InvoiceSupplier;
  currency: string;
  items: InvoiceItem[];
  totals: InvoiceTotals;
  status: InvoiceStatus;
  number?: string; // "20260001" - až při schválení; rok řady = rok schválení
  variableSymbol?: string; // = number
  issuedDate?: string; // "YYYY-MM-DD" den schválení
  dutyDate: string; // DUZP = poslední den fakturovaného měsíce
  dueDate?: string; // issuedDate + 14 dní
  // PDF schválené faktury v privátním Blobu; návrh se renderuje on-demand
  // s watermarkem NÁVRH a do Blobu se neukládá.
  pdfPath?: string;
  // Nedostatky podkladů (chybí IČO/adresa, klient nenalezen) - informativní
  // v UI; schválení blokuje jen chybějící název/adresa odběratele.
  warnings?: string[];
  generatedAt: string;
  generatedBy: string;
  source: "cron" | "manual";
  approvedAt?: string;
  approvedBy?: string;
}

const INDEX = "portal:invoices:index";
const invoiceKey = (id: string) => `portal:invoice:${id}`;
const byMonthKey = (month: string) => `portal:invoices:by-month:${month}`;

export function invoiceIdFor(
  month: string,
  clientId: string,
  currency: string,
): string {
  return `inv-${month}-${clientId}-${currency.toLowerCase()}`;
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const r = getRedis();
  if (!r) return null;
  return (await r.get<Invoice>(invoiceKey(id))) ?? null;
}

export async function listInvoicesByMonth(month: string): Promise<Invoice[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.smembers(byMonthKey(month))) ?? [];
  return loadInvoices(r, ids);
}

// Všechny faktury napříč měsíci (stránka Fakturace zobrazuje jeden seznam,
// měsíc je jen filtr). Řazení: nejnovější měsíc první, uvnitř dle odběratele.
export async function listAllInvoices(): Promise<Invoice[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.zrange<string[]>(INDEX, 0, -1, { rev: true })) ?? [];
  return loadInvoices(r, ids);
}

async function loadInvoices(
  r: NonNullable<ReturnType<typeof getRedis>>,
  ids: string[],
): Promise<Invoice[]> {
  if (!ids.length) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get<Invoice>(invoiceKey(id)));
  const res = (await pipe.exec()) as (Invoice | null)[];
  return res
    .filter((i): i is Invoice => i !== null)
    .sort(
      (a, b) =>
        b.month.localeCompare(a.month) ||
        a.customer.name.localeCompare(b.customer.name, "cs"),
    );
}

export async function upsertInvoice(inv: Invoice): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const score = new Date(inv.generatedAt).getTime();
  await Promise.all([
    r.set(invoiceKey(inv.id), inv),
    r.zadd(INDEX, { score, member: inv.id }),
    r.sadd(byMonthKey(inv.month), inv.id),
  ]);
}

export async function deleteInvoice(id: string): Promise<Invoice | null> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const inv = await getInvoice(id);
  if (!inv) return null;
  await Promise.all([
    r.del(invoiceKey(id)),
    r.zrem(INDEX, id),
    r.srem(byMonthKey(inv.month), id),
  ]);
  return inv;
}

// Nepřerušená roční řada "RRRRXXXX" (20260001, 20260002, …). Atomický INCR -
// souběžná schválení nikdy nedostanou stejné číslo. Rok = rok schválení.
export async function getNextInvoiceNumber(date = new Date()): Promise<string> {
  const r = getRedis();
  const year = date.getFullYear();
  if (!r) throw new Error("Redis not configured");
  const next = await r.incr(`portal:invoice-number:${year}`);
  return `${year}${String(next).padStart(4, "0")}`;
}

// Vrácení schválení: pokud je číslo POSLEDNÍ vystavené v roční řadě, vrátí
// čítač zpět (číslo se uvolní a další schválení ho vydá znovu) - atomicky přes
// EVAL, aby souběžný INCR z approveInvoice nemohl vyrobit duplicitní číslo.
// Když číslo poslední není, vrací false a číslo zůstává rezervované na návrhu.
export async function releaseInvoiceNumberIfLatest(
  number: string,
): Promise<boolean> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const year = number.slice(0, 4);
  const seq = parseInt(number.slice(4), 10);
  if (!Number.isFinite(seq) || seq <= 0) return false;
  const res = await r.eval(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DECR', KEYS[1]) return 1 else return 0 end`,
    [`portal:invoice-number:${year}`],
    [String(seq)],
  );
  return res === 1;
}

// Krátký zámek proti dvojímu schválení (dvojklik / dvě záložky). Okno mezi
// INCR čísla a uložením faktury by jinak umělo propálit číslo řady.
export async function acquireApproveLock(id: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return true;
  const res = await r.set(`portal:invoice-lock:${id}`, "1", {
    nx: true,
    ex: 30,
  });
  return res === "OK";
}

export async function releaseApproveLock(id: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.del(`portal:invoice-lock:${id}`);
}
