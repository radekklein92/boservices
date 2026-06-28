import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { applyRoleOverride } from "@/lib/portal/role-override";
import type { UserRole } from "@/lib/portal/users-db";
import { isDevtoolsEnabled, isEditor } from "@/lib/portal/devtools-db";

export const ADMIN_ROLES: UserRole[] = ["superadmin", "admin"];

// Role, které vidí POS / pokladní dashboard. manager je tu navíc oproti
// ADMIN_ROLES - vidí data, ale ne admin sekce. Párovací (admin) mutace POS
// dál chrání requireAdmin(), NE requirePOS().
export const POS_ROLES: UserRole[] = ["superadmin", "admin", "manager"];

export type GuardResult<T = Session> =
  | { ok: true; session: T }
  | { ok: false; response: NextResponse };

function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function forbidden(): NextResponse {
  return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
}

export async function requireSession(): Promise<GuardResult> {
  // Náhled rolí navrství i na API gating - aby "view as user" reálně dostal
  // 403 tam, kde user nemá co dělat (věrný test, ne jen kosmetika).
  const session = await applyRoleOverride(await auth());
  if (!session?.user?.email) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, session };
}

export async function requireAdmin(): Promise<GuardResult> {
  const result = await requireSession();
  if (!result.ok) return result;
  const role = result.session.user?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return { ok: false, response: forbidden() };
  }
  return result;
}

export async function requireSuperadmin(): Promise<GuardResult> {
  const result = await requireSession();
  if (!result.ok) return result;
  if (result.session.user?.role !== "superadmin") {
    return { ok: false, response: forbidden() };
  }
  return result;
}

// Guard pro ODESLÁNÍ požadavku v Konzoli změn (/portal/admin/changes): musí být
// admin, na allowlistu editorů A kill switch musí být zapnutý. Čtení stránky a
// stavu stačí requireAdmin(); tohle gatuje jen samotné založení požadavku.
export async function requireChangeEditor(): Promise<GuardResult> {
  const result = await requireAdmin();
  if (!result.ok) return result;
  if (!(await isDevtoolsEnabled())) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Konzole změn je vypnutá." },
        { status: 403 },
      ),
    };
  }
  const email = result.session.user?.email;
  if (!email || !(await isEditor(email))) {
    return { ok: false, response: forbidden() };
  }
  return result;
}

export function isAdminRole(role: UserRole | undefined): boolean {
  return role !== undefined && ADMIN_ROLES.includes(role);
}

// Vidí uživatel POS / pokladní dashboard? (manager + admin + superadmin)
export function canSeePOS(role: UserRole | undefined): boolean {
  return role !== undefined && POS_ROLES.includes(role);
}

// Guard pro read endpointy POS dat. Párovací (admin) mutace používají requireAdmin().
export async function requirePOS(): Promise<GuardResult> {
  const result = await requireSession();
  if (!result.ok) return result;
  const role = result.session.user?.role;
  if (!role || !POS_ROLES.includes(role)) {
    return { ok: false, response: forbidden() };
  }
  return result;
}
