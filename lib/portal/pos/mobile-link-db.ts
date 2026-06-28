import "server-only";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { getRedis } from "@/lib/redis";
import type { PosSelection } from "@/lib/portal/pos/filters";

// Osobní mobilní odkaz na "Živě" dashboard. JEDEN na uživatele. Veřejně dostupný na
// /m/{token} (token = nanoid48, tajný a neuhádnutelný), chráněný PINem (bcrypt).
// Po zadání PINu se do zařízení uloží httpOnly cookie = unlockToken; rotace PINu
// vygeneruje nový unlockToken, čímž stará zařízení odhlásí. Drží snapshot výběru
// prodejen + okruh (BOS/síť) + měna + DPH; období je vždy "dnes" (sledování dne).
//
//   portal:pos:mlink:{token}        → MobileLink (JSON)
//   portal:pos:mlink:owner:{email}  → token (string) - reverse lookup (1 na uživatele)
//   portal:pos:mlink:fail:{token}   → počítadlo chybných PINů (TTL) - brute-force brzda

export interface MobileLink {
  token: string;
  ownerEmail: string;
  selection: PosSelection;
  scope: "all" | "bos";
  currency: string;
  vatInclusive: boolean;
  pinHash: string;
  unlockToken: string; // důkaz odemčení v cookie; mění se se změnou PINu
  createdAt: string;
  updatedAt: string;
}

// Tvar pro UI vlastníka (bez hashů/secretů).
export interface MobileLinkPublic {
  token: string;
  selection: PosSelection;
  scope: "all" | "bos";
  currency: string;
  vatInclusive: boolean;
  updatedAt: string;
}

const PIN_ROUNDS = 12;
const MAX_PIN_FAILS = 10;
const FAIL_WINDOW_SECONDS = 15 * 60;

const linkKey = (token: string) => `portal:pos:mlink:${token}`;
const ownerKey = (email: string) => `portal:pos:mlink:owner:${email.toLowerCase()}`;
const failKey = (token: string) => `portal:pos:mlink:fail:${token}`;

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export function toPublic(l: MobileLink): MobileLinkPublic {
  return {
    token: l.token,
    selection: l.selection,
    scope: l.scope,
    currency: l.currency,
    vatInclusive: l.vatInclusive,
    updatedAt: l.updatedAt,
  };
}

export async function getMobileLink(token: string): Promise<MobileLink | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<MobileLink>(linkKey(token));
}

export async function getMobileLinkByOwner(email: string): Promise<MobileLink | null> {
  const r = getRedis();
  if (!r) return null;
  const token = await r.get<string>(ownerKey(email));
  if (!token) return null;
  return getMobileLink(token);
}

export interface UpsertInput {
  selection: PosSelection;
  scope: "all" | "bos";
  currency: string;
  vatInclusive: boolean;
  pin?: string; // při vytvoření povinný; při úpravě prázdný = ponechat stávající
}

// Upsert: jeden odkaz na uživatele. Existuje-li, RECYKLUJE token (uložený odkaz na
// ploše telefonu dál funguje) a jen aktualizuje nastavení. Zadaný PIN přehashuje a
// zrotuje unlockToken (stará zařízení se musí znovu odemknout). Bez PINu u nového
// odkazu je to chyba (PIN je povinná druhá vrstva).
export async function upsertMobileLink(email: string, input: UpsertInput): Promise<MobileLink> {
  const r = getRedis();
  if (!r) throw new Error("Redis není nakonfigurován.");
  const lower = email.toLowerCase();
  const existing = await getMobileLinkByOwner(lower);
  const now = new Date().toISOString();

  let pinHash: string;
  let unlockToken: string;
  if (input.pin && input.pin.length > 0) {
    if (!isValidPin(input.pin)) throw new Error("PIN musí být 4-6 číslic.");
    pinHash = await bcrypt.hash(input.pin, PIN_ROUNDS);
    unlockToken = nanoid(48);
  } else if (existing) {
    pinHash = existing.pinHash;
    unlockToken = existing.unlockToken;
  } else {
    throw new Error("Pro nový odkaz je nutné nastavit PIN.");
  }

  const link: MobileLink = {
    token: existing?.token ?? nanoid(48),
    ownerEmail: existing?.ownerEmail ?? email,
    selection: {
      concepts: [...input.selection.concepts],
      locations: [...input.selection.locations],
    },
    scope: input.scope,
    currency: input.currency,
    vatInclusive: input.vatInclusive,
    pinHash,
    unlockToken,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const ops: Promise<unknown>[] = [r.set(linkKey(link.token), link), r.set(ownerKey(lower), link.token)];
  if (input.pin) ops.push(r.del(failKey(link.token))); // rotace PINu uvolní rate-limit
  await Promise.all(ops);
  return link;
}

export async function deleteMobileLink(email: string): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis není nakonfigurován.");
  const lower = email.toLowerCase();
  const token = await r.get<string>(ownerKey(lower));
  const ops: Promise<unknown>[] = [r.del(ownerKey(lower))];
  if (token) ops.push(r.del(linkKey(token)), r.del(failKey(token)));
  await Promise.all(ops);
}

export type VerifyResult =
  | { ok: true; unlockToken: string }
  | { ok: false; reason: "invalid" | "locked" | "missing" };

// Ověří PIN k odkazu. Rate-limit: po MAX_PIN_FAILS chybách v okně se zamkne (token je
// už tajný, tohle je pojistka proti uhádnutí PINu při uniklém odkazu). Úspěch vrací
// aktuální unlockToken pro nastavení cookie a maže počítadlo chyb.
export async function verifyPin(token: string, pin: string): Promise<VerifyResult> {
  const r = getRedis();
  if (!r) return { ok: false, reason: "missing" };
  const link = await getMobileLink(token);
  if (!link) return { ok: false, reason: "missing" };

  const fails = (await r.get<number>(failKey(token))) ?? 0;
  if (fails >= MAX_PIN_FAILS) return { ok: false, reason: "locked" };

  const match = isValidPin(pin) && (await bcrypt.compare(pin, link.pinHash));
  if (!match) {
    const next = await r.incr(failKey(token));
    if (next === 1) await r.expire(failKey(token), FAIL_WINDOW_SECONDS);
    return { ok: false, reason: "invalid" };
  }
  await r.del(failKey(token));
  return { ok: true, unlockToken: link.unlockToken };
}

// Cookie odpovídá aktuálnímu unlockTokenu odkazu? (důkaz, že zařízení už PIN zadalo)
export function isUnlocked(link: MobileLink, cookieValue: string | undefined): boolean {
  return !!cookieValue && cookieValue === link.unlockToken;
}

export const MLINK_COOKIE = (token: string) => `mlink_${token}`;
