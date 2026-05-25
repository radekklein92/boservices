import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/portal/users-db";
import { Sidebar } from "@/components/portal/shell/Sidebar";
import { MobileTopBar } from "@/components/portal/shell/MobileTopBar";
import { UserMenu } from "@/components/portal/shell/UserMenu";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";

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

  return (
    <div className="min-h-[100dvh] bg-paper-warm">
      <Sidebar session={session} />
      <MobileTopBar isAdmin={isAdmin} userMenu={<UserMenu session={session} />} />
      <main className="px-5 py-6 md:ml-64 md:px-12 md:py-14 lg:px-16 lg:py-16">
        <div className="mx-auto w-full max-w-[1280px]">{children}</div>
      </main>
    </div>
  );
}
