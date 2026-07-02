import Link from "next/link";
import type { Session } from "next-auth";
import { Logo } from "@/components/brand/Logo";
import { isAdminRole, canSeePOS } from "@/lib/portal/auth-guard";
import { isSalespersonEmail } from "@/lib/portal/commissions";
import { SidebarNav } from "./SidebarNav";
import { UserMenu } from "./UserMenu";

export function Sidebar({
  session,
  tasksBadge = 0,
  changesBadge = 0,
}: {
  session: Session;
  tasksBadge?: number;
  changesBadge?: number;
}) {
  const isAdmin = isAdminRole(session.user?.role);
  // Provize vidí admini + sami obchodníci (Toman/Ebermann dle e-mailu).
  const canSeeCommissions = isAdmin || isSalespersonEmail(session.user?.email);
  const canSeePos = canSeePOS(session.user?.role);

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
        canSeePOS={canSeePos}
        changesBadge={changesBadge}
      />

      <div className="border-t border-edge p-3">
        <UserMenu session={session} tasksBadge={tasksBadge} />
      </div>
    </aside>
  );
}
