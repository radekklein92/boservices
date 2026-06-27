"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  BarChart3,
  Building2,
  ChevronDown,
  Cloud,
  FileText,
  FilePenLine,
  HandCoins,
  KeyRound,
  ListChecks,
  MapPin,
  Palette,
  Send,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

type Item = {
  href: string;
  label: string;
  Icon: LucideIcon;
  disabled?: boolean;
  // external = plný odkaz do jiné aplikace (DW dashboard) → <a>, ne client <Link>.
  external?: boolean;
  // newTab = otevřít v novém okně/záložce (target="_blank").
  newTab?: boolean;
};

const main: Item[] = [
  { href: "/portal", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/portal/tasks", label: "Úkoly", Icon: ListChecks },
];

// Franšízing: klientská část (klienti, smlouvy, provize).
const fransizing: Item[] = [
  { href: "/portal/clients", label: "Klienti", Icon: Building2 },
  { href: "/portal/contracts", label: "Smlouvy", Icon: FileText },
];

// Provoz: lokality, real estate a pokladní dashboard (Tržby).
const provoz: Item[] = [
  { href: "/portal/locations", label: "Lokality", Icon: MapPin },
  { href: "/portal/real-estate", label: "Real Estate", Icon: KeyRound },
];

// Tržby (POS): v sekci Provoz, ale jen pro role s přístupem do Pokladny (canSeePOS).
const posItem: Item = { href: "/portal/pos", label: "Tržby", Icon: BarChart3 };

// Provize: v sekci Franšízing, ale jen pro ty, kdo na ni mají vidět (admini +
// obchodníci Toman/Ebermann); ostatní staff ji nevidí.
const commissionsItem: Item = {
  href: "/portal/commissions",
  label: "Provize",
  Icon: HandCoins,
};

const admin: Item[] = [
  { href: "/portal/admin/pos-pairing", label: "Párování pokladen", Icon: Store },
  { href: "/portal/templates", label: "Šablony smluv", Icon: FilePenLine },
  { href: "/portal/design-system", label: "Design system", Icon: Palette },
  { href: "/portal/admin/telegram", label: "Telegram", Icon: Send },
  { href: "/portal/users", label: "Uživatelé", Icon: Users },
  // Dotykačka = správa cloudů i API klíčů; obojí žije v DW dashboardu
  // (dw.boservices.cz, vlastní nav). Odkaz jde přes /api/portal/sso-dw (SSO
  // handoff → bez druhého loginu); external = plný <a>, newTab = nové okno.
  {
    href: "/api/portal/sso-dw?to=clouds",
    label: "Dotykačka",
    Icon: Cloud,
    external: true,
    newTab: true,
  },
];

export function SidebarNav({
  isAdmin,
  canSeeCommissions = false,
  canSeePOS = false,
  tasksBadge = 0,
}: {
  isAdmin: boolean;
  canSeeCommissions?: boolean;
  canSeePOS?: boolean;
  tasksBadge?: number;
}) {
  const pathname = usePathname() ?? "/portal";

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pt-2 pb-6">
      <NavSection label="Hlavní">
        {main.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(pathname, item.href)}
            badge={item.href === "/portal/tasks" ? tasksBadge : 0}
          />
        ))}
      </NavSection>

      <NavSection label="Franšízing">
        {fransizing.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
        {/* Provize ve Franšízingu - jen pro adminy + obchodníky (canSeeCommissions). */}
        {canSeeCommissions && (
          <NavItem {...commissionsItem} active={isActive(pathname, commissionsItem.href)} />
        )}
      </NavSection>

      <NavSection label="Provoz">
        {provoz.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
        {/* Tržby (POS) v Provozu - jen pro manager+/admin (canSeePOS). */}
        {canSeePOS && <NavItem {...posItem} active={isActive(pathname, posItem.href)} />}
      </NavSection>

      {isAdmin && (
        <CollapsibleNavSection label="Administrace" storageKey="sidebar:admin-open">
          {admin.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
        </CollapsibleNavSection>
      )}
    </nav>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/portal") return pathname === "/portal";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-7 first:mt-1">
      <div className="px-3 pb-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

// Sbalitelná sekce - hlavička je tlačítko, defaultně sbalená, stav se pamatuje
// v localStorage napříč reloady. uppercase musí být přímo na <button>, protože
// Tailwind Preflight nastavuje button{text-transform:none} (nedědí se z rodiče).
function CollapsibleNavSection({
  label,
  storageKey,
  defaultOpen = false,
  children,
}: {
  label: string;
  storageKey: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // localStorage není dostupná při SSR - načti uloženou preferenci až po hydrataci.
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "open") setOpen(true);
    else if (saved === "closed") setOpen(false);
  }, [storageKey]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      window.localStorage.setItem(storageKey, next ? "open" : "closed");
      return next;
    });
  }

  return (
    <div className="mt-7 first:mt-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-3 pb-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid transition-colors hover:text-ink-base"
      >
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${
            open ? "rotate-0" : "-rotate-90"
          }`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  href,
  label,
  Icon,
  active,
  disabled,
  external,
  newTab,
  badge = 0,
}: Item & { active: boolean; badge?: number }) {
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

  const inner = (
    <>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && (
        <span
          role="status"
          aria-label="Nové úkoly"
          title="Nové úkoly"
          className={`h-2 w-2 shrink-0 rounded-full bg-rose-500 ${
            active ? "ring-2 ring-ink-base" : ""
          }`}
        />
      )}
    </>
  );

  // Odkaz do jiné aplikace (DW dashboard přes SSO) musí být plná navigace, ne
  // client-side <Link> (ten by mířil na route handler a selhal).
  if (external) {
    return (
      <a
        href={href}
        className={`${base} ${state}`}
        {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={`${base} ${state}`}>
      {inner}
    </Link>
  );
}
