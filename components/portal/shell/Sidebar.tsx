import Link from "next/link";
import type { Session } from "next-auth";
import { Logo } from "@/components/brand/Logo";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { isSalespersonEmail } from "@/lib/portal/commissions";
import { SidebarNav } from "./SidebarNav";
import { UserMenu } from "./UserMenu";
import { RoleSwitcher } from "./RoleSwitcher";

export function Sidebar({
  session,
  tasksBadge = 0,
}: {
  session: Session;
  tasksBadge?: number;
}) {
  const isAdmin = isAdminRole(session.user?.role);
  // Provize vidí admini + sami obchodníci (Toman/Ebermann dle e-mailu).
  const canSeeCommissions = isAdmin || isSalespersonEmail(session.user?.email);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-edge bg-paper md:flex">
      <div className="flex items-center gap-3 px-5 pt-7 pb-3">
        <Link href="/portal" className="-m-1 inline-flex p-1" aria-label="Portál BOServices">
          <Logo />
        </Link>
        <span className="border-l border-edge pl-3 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          Portál
        </span>
      </div>

      <SidebarNav
        isAdmin={isAdmin}
        canSeeCommissions={canSeeCommissions}
        tasksBadge={tasksBadge}
      />

      <div className="border-t border-edge p-3">
        <RoleSwitcher
          realRole={session.user?.realRole}
          effectiveRole={session.user?.role}
        />
        <UserMenu session={session} />
      </div>
    </aside>
  );
}
