import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import type { UserRole } from "@/lib/portal/users-db";

export const ADMIN_ROLES: UserRole[] = ["superadmin", "admin"];

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
  const session = await auth();
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

export function isAdminRole(role: UserRole | undefined): boolean {
  return role !== undefined && ADMIN_ROLES.includes(role);
}
