"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Building2,
  FileText,
  FilePenLine,
  Users,
  type LucideIcon,
} from "lucide-react";

type Item = {
  href: string;
  label: string;
  Icon: LucideIcon;
  disabled?: boolean;
};

const main: Item[] = [
  { href: "/portal", label: "Dashboard", Icon: LayoutDashboard },
];

const provoz: Item[] = [
  { href: "/portal/clients", label: "Klienti", Icon: Building2 },
  { href: "/portal/contracts", label: "Smlouvy", Icon: FileText, disabled: true },
  { href: "/portal/templates", label: "Šablony", Icon: FilePenLine, disabled: true },
];

const admin: Item[] = [
  { href: "/portal/users", label: "Uživatelé", Icon: Users },
];

export function SidebarNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? "/portal";

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pt-2 pb-6">
      <NavSection label="Hlavní">
        {main.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(pathname, item.href)}
          />
        ))}
      </NavSection>

      <NavSection label="Provoz">
        {provoz.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(pathname, item.href)}
          />
        ))}
      </NavSection>

      {isAdmin && (
        <NavSection label="Administrace">
          {admin.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={isActive(pathname, item.href)}
            />
          ))}
        </NavSection>
      )}
    </nav>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/portal") return pathname === "/portal";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-7 first:mt-1">
      <div className="px-3 pb-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  href,
  label,
  Icon,
  active,
  disabled,
}: Item & { active: boolean }) {
  const base =
    "group flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-all duration-200";
  const state = active
    ? "bg-ink-base text-paper shadow-[0_2px_8px_-2px_rgba(14,14,14,0.15)]"
    : disabled
      ? "text-ink-soft cursor-not-allowed"
      : "text-ink-deep hover:bg-edge-warm hover:text-ink-base";

  if (disabled) {
    return (
      <div className={`${base} ${state}`} aria-disabled="true">
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span className="flex-1 truncate">{label}</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft/70">
          Brzy
        </span>
      </div>
    );
  }

  return (
    <Link href={href} className={`${base} ${state}`}>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
