import { cookies } from "next/headers";
import type { Session } from "next-auth";
import type { UserRole } from "@/lib/portal/users-db";

// Náhled rolí ("view as") pro testování. Superadmin si může dočasně nasadit
// nižší roli a vidět portál přesně tak, jak ho vidí admin/uživatel - včetně
// serverového gatingu (nav se skryje, API vrátí 403). Skutečná role zůstává
// uložená v JWT i v session.user.realRole, takže přepnout zpět jde vždycky.
//
// Override je čistě efemérní cookie - NEMĚNÍ roli v DB ani v JWT.

export const ASSUME_ROLE_COOKIE = "bos-assume-role";

// Role, do kterých se dá nasadit. Pořadí = pořadí v přepínači (od nejvyšší).
export const ASSUMABLE_ROLES: UserRole[] = ["superadmin", "admin", "manager", "user"];

function isAssumableRole(value: string | undefined | null): value is UserRole {
  return value != null && (ASSUMABLE_ROLES as string[]).includes(value);
}

// Přečte cookie s nasazenou rolí (nezohledňuje oprávnění - to dělá až
// applyRoleOverride / set akce).
export async function readAssumedRoleCookie(): Promise<UserRole | null> {
  const store = await cookies();
  const raw = store.get(ASSUME_ROLE_COOKIE)?.value;
  return isAssumableRole(raw) ? raw : null;
}

// Navrství náhled role na session. Honoruje cookie JEN když je skutečná role
// superadmin - jinak ji ignoruje (nižší role si vyšší nenasadí). Když se
// nasazená role rovná skutečné (= superadmin → superadmin), náhled se nepočítá.
//
// Po aplikaci platí:
//   session.user.role        = efektivní role (to, čím se řídí celé UI i gating)
//   session.user.realRole    = skutečná role z JWT (vždy)
//   session.user.assumedRole = nasazená role, jen pokud reálně probíhá náhled
export async function applyRoleOverride(
  session: Session | null,
): Promise<Session | null> {
  if (!session?.user) return session;

  // realRole je primárně nastavená v session callbacku (auth.ts); fallback pro
  // jistotu, kdyby session přišla odjinud.
  const realRole = session.user.realRole ?? session.user.role;
  session.user.realRole = realRole;

  if (realRole !== "superadmin") {
    // Náhled není povolen - vyčistit případné zbytky.
    session.user.assumedRole = undefined;
    return session;
  }

  const assumed = await readAssumedRoleCookie();
  if (assumed && assumed !== realRole) {
    session.user.role = assumed;
    session.user.assumedRole = assumed;
  } else {
    session.user.role = realRole;
    session.user.assumedRole = undefined;
  }
  return session;
}
