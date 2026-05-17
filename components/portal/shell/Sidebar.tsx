import Link from "next/link";
import type { Session } from "next-auth";
import { Logo } from "@/components/brand/Logo";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { SidebarNav } from "./SidebarNav";
import { UserMenu } from "./UserMenu";

export function Sidebar({ session }: { session: Session }) {
  const isAdmin = isAdminRole(session.user?.role);

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

      <SidebarNav isAdmin={isAdmin} />

      <div className="border-t border-edge p-3">
        <UserMenu session={session} />
      </div>
    </aside>
  );
}
