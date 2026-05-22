import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Construction,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { countLeads } from "@/lib/portal/leads-db";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import {
  cachedListAllowlist,
  cachedListUsers,
} from "@/lib/portal/cached-db";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
  const [session, users, allowlist, leads] = await Promise.all([
    getSession(),
    cachedListUsers(),
    cachedListAllowlist(),
    countLeads(),
  ]);
  const isAdmin = isAdminRole(session?.user?.role);

  const pendingInvites = allowlist.filter((a) => a.status === "pending").length;
  const displayName =
    session?.user?.name?.split(/\s+/)[0] ?? session?.user?.email ?? "uživateli";

  return (
    <div className="flex flex-col gap-14">
      <PageHeader
        eyebrow="Dashboard"
        title={`Vítejte, ${displayName}.`}
        lede="Souhrn portálu. V dalších fázích sem doplníme přehledy klientů, smluv a aktivity."
      />

      <section>
        <SectionLabel>Přehled</SectionLabel>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            label="Aktivní uživatelé"
            value={users.length}
            hint={users.length === 0 ? "—" : "v portálu"}
          />
          <StatCard
            label="Čekající pozvánky"
            value={pendingInvites}
            hint={pendingInvites === 0 ? "vše přijato" : "k nastavení hesla"}
          />
          <StatCard
            label="Leady z webu"
            value={leads}
            hint="kontaktní formulář"
          />
        </div>
      </section>

      {isAdmin && (
        <section>
          <SectionLabel>Co můžete udělat</SectionLabel>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <ActionCard
              href="/portal/users"
              title="Pozvat uživatele"
              body="Přidáte e-mail do allowlistu a Resend pošle pozvánku s odkazem pro nastavení hesla."
              Icon={Plus}
            />
            <ActionCard
              href="/portal/users"
              title="Správa uživatelů"
              body="Reset hesla, změna role, odebrání přístupu — vše v jednom přehledu."
              Icon={Users}
            />
          </div>
        </section>
      )}

      <section>
        <SectionLabel>Roadmapa</SectionLabel>
        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-6 border-t border-edge pt-7 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
          <RoadmapItem
            index="01"
            label="Klienti"
            status="done"
            hint="CRUD, ARES import, kontakty"
          />
          <RoadmapItem
            index="02"
            label="Smlouvy"
            status="done"
            hint="6 typů, generování PDF, milestony, sken"
          />
          <RoadmapItem
            index="03"
            label="Šablony smluv"
            status="done"
            hint="WYSIWYG editor, varianty, diff"
          />
          <RoadmapItem
            index="04"
            label="Lokality"
            status="in-progress"
            hint="Evidence prostor a nájemních smluv"
          />
          <RoadmapItem
            index="05"
            label="Reporting & KPI"
            status="planned"
            hint="Tržby, marže, srovnání lokalit"
          />
          <RoadmapItem
            index="06"
            label="Aktivita & notifikace"
            status="planned"
            hint="Kdo co kdy, alerty na milníky"
          />
        </div>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
      <span
        aria-hidden="true"
        className="mr-3 inline-block h-px w-6 translate-y-[-3px] bg-ink-base/50 align-middle"
      />
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-[28px] border border-edge bg-paper p-7 transition-colors hover:border-ink-soft">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
        {label}
      </div>
      <div className="mt-4 font-extrabold text-ink-base text-[2.75rem] leading-[1] tracking-[-0.04em]">
        {value.toLocaleString("cs-CZ")}
      </div>
      <div className="mt-1.5 text-[12.5px] text-ink-mid">{hint}</div>
    </div>
  );
}

function ActionCard({
  href,
  title,
  body,
  Icon,
}: {
  href: string;
  title: string;
  body: string;
  Icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-5 rounded-[24px] border border-edge bg-paper p-6 transition-colors hover:border-ink-base"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-edge-warm text-ink-base transition-colors group-hover:bg-ink-base group-hover:text-paper">
        <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
            {title}
          </h3>
          <ArrowUpRight
            className="h-4 w-4 text-ink-mid transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            strokeWidth={1.5}
          />
        </div>
        <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-deep">
          {body}
        </p>
      </div>
    </Link>
  );
}

type RoadmapStatus = "done" | "in-progress" | "planned";

const STATUS_CONFIG: Record<
  RoadmapStatus,
  { Icon: LucideIcon; label: string; iconClass: string; labelClass: string }
> = {
  done: {
    Icon: CheckCircle2,
    label: "Hotovo",
    iconClass: "bg-ink-base text-paper",
    labelClass: "text-ink-deep",
  },
  "in-progress": {
    Icon: Construction,
    label: "Připravujeme",
    iconClass: "bg-edge-warm text-ink-base",
    labelClass: "text-ink-deep",
  },
  planned: {
    Icon: CircleDashed,
    label: "Plánováno",
    iconClass: "bg-paper text-ink-soft border border-edge",
    labelClass: "text-ink-mid",
  },
};

function RoadmapItem({
  index,
  label,
  status,
  hint,
}: {
  index: string;
  label: string;
  status: RoadmapStatus;
  hint?: string;
}) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.Icon;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${cfg.iconClass}`}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="font-mono text-[11px] tracking-tight text-ink-soft">
          {index}
        </div>
      </div>
      <div className="text-[1rem] font-bold tracking-[-0.02em] text-ink-base">
        {label}
      </div>
      <div className={`text-[10.5px] font-semibold uppercase tracking-[0.18em] ${cfg.labelClass}`}>
        {cfg.label}
      </div>
      {hint && (
        <p className="text-[12.5px] leading-snug text-ink-mid">{hint}</p>
      )}
    </div>
  );
}
