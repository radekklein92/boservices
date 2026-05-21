import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { listUsers } from "@/lib/portal/users-db";
import { listAllowlist } from "@/lib/portal/allowlist-db";
import { UsersClient } from "@/components/portal/users/UsersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Uživatelé" };

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/login");
  if (!isAdminRole(session.user?.role)) redirect("/portal");

  const [users, allowlist] = await Promise.all([listUsers(), listAllowlist()]);
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
