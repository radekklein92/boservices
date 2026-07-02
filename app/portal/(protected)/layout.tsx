import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/portal/users-db";
import { Sidebar } from "@/components/portal/shell/Sidebar";
import { MobileTopBar } from "@/components/portal/shell/MobileTopBar";
import { UserMenu } from "@/components/portal/shell/UserMenu";
import { RoleAssumptionBanner } from "@/components/portal/shell/RoleAssumptionBanner";
import { FeedbackWidget } from "@/components/portal/feedback/FeedbackWidget";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole, canSeePOS } from "@/lib/portal/auth-guard";
import { isSalespersonEmail } from "@/lib/portal/commissions";
import { cachedListTasks } from "@/lib/portal/cached-db";
import { getSeenMap } from "@/lib/portal/tasks-db";
import { unseenCount } from "@/lib/portal/tasks-shared";
import { countPendingFeedback } from "@/lib/portal/feedback-db";

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
  const canSeePos = canSeePOS(session.user?.role);

  const [tasks, seenMap, changesBadge] = await Promise.all([
    cachedListTasks(),
    getSeenMap(session.user.email),
    // Počet nevyřízených návrhů z feedbacku (odznak u „Změny portálu") - jen admin.
    isAdmin ? countPendingFeedback() : Promise.resolve(0),
  ]);
  const tasksBadge = unseenCount(tasks, seenMap);

  return (
    <div className="min-h-[100dvh] bg-paper-warm">
      <Sidebar session={session} tasksBadge={tasksBadge} changesBadge={changesBadge} />
      <MobileTopBar
        isAdmin={isAdmin}
        canSeeCommissions={canSeeCommissions}
        canSeePOS={canSeePos}
        tasksBadge={tasksBadge}
        changesBadge={changesBadge}
        userMenu={<UserMenu session={session} tasksBadge={tasksBadge} />}
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
      <FeedbackWidget
        userName={session.user.name ?? session.user.email}
        userEmail={session.user.email}
      />
    </div>
  );
}
