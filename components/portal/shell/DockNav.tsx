"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { House, ListChecks, type LucideIcon } from "lucide-react";
import { isActive } from "./SidebarNav";

// Dashboard a Úkoly jako ikonové odkazy ve spodním docku (UserMenu). Icon-only
// záměrně - portál je denně používaný interní nástroj; label nese title +
// aria-label. Aktivní stav zrcadlí NavItem (černá pilulka).
export function DockNav({ tasksBadge = 0 }: { tasksBadge?: number }) {
  const pathname = usePathname() ?? "/portal";

  return (
    <>
      <DockLink
        href="/portal"
        label="Dashboard"
        Icon={House}
        active={isActive(pathname, "/portal")}
      />
      <DockLink
        href="/portal/tasks"
        label="Úkoly"
        Icon={ListChecks}
        active={isActive(pathname, "/portal/tasks")}
        badge={tasksBadge}
        badgeLabel="Nové úkoly"
      />
    </>
  );
}

function DockLink({
  href,
  label,
  Icon,
  active,
  badge = 0,
  badgeLabel,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  badge?: number;
  badgeLabel?: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
        active
          ? "bg-ink-base text-paper shadow-[0_2px_8px_-2px_rgba(14,14,14,0.15)]"
          : "text-ink-mid hover:bg-edge-warm hover:text-ink-base"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      {badge > 0 && (
        <span
          role="status"
          aria-label={badgeLabel}
          title={badgeLabel}
          className={`absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ${
            active ? "ring-ink-base" : "ring-paper"
          }`}
        />
      )}
    </Link>
  );
}
