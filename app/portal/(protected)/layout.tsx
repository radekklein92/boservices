import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/portal/users-db";
import { Sidebar } from "@/components/portal/shell/Sidebar";
import { MobileTopBar } from "@/components/portal/shell/MobileTopBar";
import { UserMenu } from "@/components/portal/shell/UserMenu";
import { RoleSwitcher } from "@/components/portal/shell/RoleSwitcher";
import { RoleAssumptionBanner } from "@/components/portal/shell/RoleAssumptionBanner";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { isSalespersonEmail } from "@/lib/portal/commissions";
import { cachedListTasks } from "@/lib/portal/cached-db";
import { getSeenMap } from "@/lib/portal/tasks-db";
import { unseenCount } from "@/lib/portal/tasks-shared";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getSession je React.cache memoizovaná - další volání ze stránek v rámci
  // stejného requestu nevyvolá nový JWT decrypt.
  const session = await getSession();
  if (!session?.user?.email) {
    redirect("/portal/login");
  }

  recordActivity(session.user.email).catch((err) =>
    console.error("[portal] recordActivity failed", err),
  );

  const isAdmin = isAdminRole(session.user?.role);
  const canSeeCommissions = isAdmin || isSalespersonEmail(session.user?.email);

  const [tasks, seenMap] = await Promise.all([
    cachedListTasks(),
    getSeenMap(session.user.email),
  ]);
  const tasksBadge = unseenCount(tasks, seenMap);

  return (
    <div className="min-h-[100dvh] bg-paper-warm">
      <Sidebar session={session} tasksBadge={tasksBadge} />
      <MobileTopBar
        isAdmin={isAdmin}
        canSeeCommissions={canSeeCommissions}
        tasksBadge={tasksBadge}
        roleSwitcher={
          <RoleSwitcher
            realRole={session.user?.realRole}
            effectiveRole={session.user?.role}
          />
        }
        userMenu={<UserMenu session={session} />}
      />
      <main className="px-5 py-6 md:ml-64 md:px-12 md:py-14 lg:px-16 lg:py-16">
        <div className="mx-auto w-full max-w-[1280px]">
          <RoleAssumptionBanner
            assumedRole={session.user?.assumedRole}
            realRole={session.user?.realRole}
          />
          {children}
        </div>
      </main>
    </div>
  );
}
