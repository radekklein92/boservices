import { getRedis } from "@/lib/redis";
import { isMaskedAccount, MASKED_ACCOUNT_LABEL } from "@/lib/portal/masked-account";

// manager: vidí celý POS / pokladní dashboard (všechny značky a pobočky), ale
// NENÍ admin (nemá přístup do Administrace, párování pokladen ani uživatelů).
// Pořadí role nemá funkční význam, jen čitelnost.
export type UserRole = "superadmin" | "admin" | "manager" | "user";

// Sekundární atribut "Podepisující". Ortogonální k role - může ho mít kdokoli.
// Když je isSigner=true, signerFunction určuje text v PDF u podpisu poskytovatele
// (jednatel = "jednatel", power-of-attorney = "na základě plné moci").
// signerDisplayName je volitelný override jména v PDF (např. "Ing. Jiří Slavkovský"
// místo jen "Jiří Slavkovský" v users listu).
export type SignerFunction = "jednatel" | "power-of-attorney";

export interface User {
  email: string;
  name: string;
  role: UserRole;
  // Telefon (E.164 nebo české 9místné) - používá DigiSign u podepisujícího za BOS.
  phone?: string;
  passwordHash?: string;
  createdAt: string;
  lastLoginAt?: string;
  lastActiveAt?: string;
  isSigner?: boolean;
  signerFunction?: SignerFunction;
  signerDisplayName?: string;
  // Pouze relevantní když signerFunction === "power-of-attorney":
  // jméno osoby, jejíž substituční plnou moc Podepisující vykonává.
  // Volitelné - když není vyplněné, role text fallbackuje na "na základě
  // plné moci" (bez substituční přídavku).
  signerPoaSubstituteFor?: string;
  // Schvalovatel šablon smluv. Flag může mít víc uživatelů - e-mail upomínka
  // pak chodí všem a každý z nich vidí v UI tlačítko "Schválit". Ostatní
  // uživatelé vidí "Čeká na schválení" + "Připomenout emailem".
  isTemplateApprover?: boolean;
}

// Najde všechny uživatele s isTemplateApprover=true. Flag jich může mít víc -
// e-mail upomínka chodí všem a schvalovat v UI může každý z nich.
// Pokud žádný není, vrací [] - UI degraduje gracefully (žádný "Schválit"
// button se nezobrazí, reminder nemá kam poslat).
export async function getTemplateApprovers(): Promise<User[]> {
  const { getRedis: _getRedis } = await import("@/lib/redis");
  const r = _getRedis();
  if (!r) return [];
  const emails = await r.smembers("portal:users:all");
  if (!emails.length) return [];
  const pipe = r.pipeline();
  emails.forEach((e) => pipe.get<User>(userKey(e)));
  const results = (await pipe.exec()) as (User | null)[];
  return results.filter((u): u is User => !!u && !!u.isTemplateApprover);
}

// Vrací text pro {{providerStatutory1Role}} v PDF/HTML smlouvy.
// Pro jednatele: "jednatel".
// Pro substituční PM s vyplněným polem: "na základě substituční plné moci za X".
// Pro substituční PM bez vyplnění: fallback "na základě plné moci".
export function signerRoleText(
  user: Pick<User, "signerFunction" | "signerPoaSubstituteFor">,
): string {
  if (user.signerFunction === "jednatel") return "jednatel";
  if (user.signerFunction === "power-of-attorney") {
    const sub = user.signerPoaSubstituteFor?.trim();
    return sub
      ? `na základě substituční plné moci za ${sub}`
      : "na základě plné moci";
  }
  return "";
}

// UI label v dropdownu / detailu uživatele.
export function signerFunctionLabel(fn: SignerFunction): string {
  return fn === "jednatel" ? "Jednatel" : "Substituční plná moc";
}

// Krátká varianta pro stísněné UI prvky (badge v listu uživatelů).
export function signerFunctionShortLabel(fn: SignerFunction): string {
  return fn === "jednatel" ? "Jednatel" : "Subst. PM";
}

const ACTIVITY_THROTTLE_MS = 60_000;

const userKey = (email: string) => `portal:user:${email.toLowerCase()}`;

export async function getUser(email: string): Promise<User | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<User>(userKey(email));
}

export async function upsertUser(user: User): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const normalized: User = { ...user, email: user.email.toLowerCase() };
  await Promise.all([
    r.set(userKey(normalized.email), normalized),
    r.sadd("portal:users:all", normalized.email),
  ]);
}

export async function setPasswordHash(email: string, passwordHash: string): Promise<void> {
  const u = await getUser(email);
  if (!u) throw new Error("User not found");
  await upsertUser({ ...u, passwordHash });
}

export async function recordLogin(email: string): Promise<void> {
  const u = await getUser(email);
  if (!u) return;
  const now = new Date().toISOString();
  await upsertUser({ ...u, lastLoginAt: now, lastActiveAt: now });
}

export async function recordActivity(email: string): Promise<void> {
  const u = await getUser(email);
  if (!u) return;
  if (u.lastActiveAt) {
    const last = Date.parse(u.lastActiveAt);
    if (Number.isFinite(last) && Date.now() - last < ACTIVITY_THROTTLE_MS) {
      return;
    }
  }
  await upsertUser({ ...u, lastActiveAt: new Date().toISOString() });
}

export async function listUsers(): Promise<User[]> {
  const r = getRedis();
  if (!r) return [];
  const emails = await r.smembers("portal:users:all");
  if (!emails.length) return [];
  const pipe = r.pipeline();
  emails.forEach((e) => pipe.get<User>(userKey(e)));
  const results = (await pipe.exec()) as (User | null)[];
  return results
    .filter((u): u is User => u !== null)
    // Účet majitele zobrazujeme všude anonymně jako "Admin". listUsers se používá
    // jen pro ZOBRAZENÍ seznamů (ne pro round-trip zápis zpět - ten jde přes
    // getUser+upsertUser, který necháváme nedotčený), takže je bezpečné jméno
    // přepsat tady - pokryje to všechna místa, kde se vykreslují jména uživatelů.
    .map((u) =>
      isMaskedAccount(u.email) ? { ...u, name: MASKED_ACCOUNT_LABEL } : u,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deleteUser(email: string): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const e = email.toLowerCase();
  await Promise.all([r.del(userKey(e)), r.srem("portal:users:all", e)]);
}
