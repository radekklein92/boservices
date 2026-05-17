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
      <div className="px-5 pt-7 pb-3">
        <Link href="/portal" className="-m-1 inline-flex p-1" aria-label="Portál BOServices">
          <Logo />
        </Link>
        <div className="ml-9 mt-1.5 text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          Portál
        </div>
      </div>

      <SidebarNav isAdmin={isAdmin} />

      <div className="border-t border-edge p-3">
        <UserMenu session={session} />
      </div>

      <div className="px-5 pb-4 pt-1 text-[9px] font-medium uppercase tracking-[0.32em] text-ink-soft/70">
        Provoz · Lidé · Standard · Růst
      </div>
    </aside>
  );
}
