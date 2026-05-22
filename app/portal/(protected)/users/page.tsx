import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import {
  cachedListAllowlist,
  cachedListUsers,
} from "@/lib/portal/cached-db";
import { UsersClient } from "@/components/portal/users/UsersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Uživatelé" };

export default async function UsersPage() {
  const [session, users, allowlist] = await Promise.all([
    getSession(),
    cachedListUsers(),
    cachedListAllowlist(),
  ]);
  if (!session?.user?.email) redirect("/portal/login");
  if (!isAdminRole(session.user?.role)) redirect("/portal");

  const pending = allowlist.filter((a) => a.status === "pending");

  const sanitized = users.map(({ passwordHash, ...rest }) => {
    void passwordHash;
    return rest;
  });

  return (
    <UsersClient
      currentEmail={session.user.email}
      currentRole={session.user.role!}
      initialUsers={sanitized}
      initialAllowlist={pending}
    />
  );
}
