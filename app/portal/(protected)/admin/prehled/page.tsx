import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  FileText,
  HandCoins,
  ListChecks,
  MapPin,
  Sparkles,
  Store,
  UserPlus,
  Users,
} from "lucide-react";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import {
  cachedListAllowlist,
  cachedListLocations,
  cachedListPayouts,
  cachedListTasks,
  cachedListUsers,
} from "@/lib/portal/cached-db";
import { countClients } from "@/lib/portal/clients-db";
import { countContracts } from "@/lib/portal/contracts-db";
import { countLeads } from "@/lib/portal/leads-db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Přehled systému" };

// Testovací přehledová stránka - shrnuje počty hlavních entit v systému
// (prodejny, uživatelé, klienti, smlouvy, …). Čistě read-only souhrn pro
// rychlou kontrolu stavu dat. Counts jdou přes cached-db / count* helpery,
// které při nedostupném Redisu degradují na 0 (stránka tak nikdy nespadne).

const cs = new Intl.NumberFormat("cs-CZ");

function fmt(n: number): string {
  return cs.format(n);
}

export default async function AdminOverviewPage() {
  const session = await getSession();
  if (!session?.user?.email) redirect("/portal/login");
  if (!isAdminRole(session.user?.role)) redirect("/portal");

  const [
    locations,
    users,
    clients,
    contracts,
    tasks,
    payouts,
    leads,
    allowlist,
  ] = await Promise.all([
    cachedListLocations(),
    cachedListUsers(),
    countClients(),
    countContracts(),
    cachedListTasks(),
    cachedListPayouts(),
    countLeads(),
    cachedListAllowlist(),
  ]);

  const pendingRegistrations = allowlist.filter(
    (a) => a.status === "pending",
  ).length;

  const primary: StatCardProps[] = [
    {
      label: "Prodejny",
      value: locations.length,
      Icon: Store,
      hint: "Lokality zrcadlené z Transition",
    },
    {
      label: "Uživatelé",
      value: users.length,
      Icon: Users,
      hint: "Účty s přístupem do portálu",
    },
    {
      label: "Klienti",
      value: clients,
      Icon: Building2,
    },
    {
      label: "Smlouvy",
      value: contracts,
      Icon: FileText,
    },
    {
      label: "Úkoly",
      value: tasks.length,
      Icon: ListChecks,
    },
    {
      label: "Výplaty",
      value: payouts.length,
      Icon: HandCoins,
    },
    {
      label: "Leady",
      value: leads,
      Icon: Sparkles,
    },
    {
      label: "Čekající registrace",
      value: pendingRegistrations,
      Icon: UserPlus,
      hint: "Allowlist ve stavu pending",
    },
  ];

  // Prodejny podle provozního stavu (location_status z Transition).
  const locationStatusLabels: Record<string, string> = {
    construction: "Ve výstavbě",
    open: "Otevřené",
    closing: "Zavírají se",
    closed: "Zavřené",
    unknown: "Neuvedeno",
  };
  const locationsByStatus = countBy(
    locations.map((l) => l.location_status ?? "unknown"),
  );

  // Uživatelé podle role.
  const roleLabels: Record<string, string> = {
    superadmin: "Superadmin",
    admin: "Admin",
    manager: "Manažer",
    user: "Uživatel",
  };
  const usersByRole = countBy(users.map((u) => u.role ?? "user"));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Administrace"
        title="Přehled systému"
        lede="Testovací souhrn počtů hlavních entit v systému - prodejny, uživatelé a další. Slouží k rychlé kontrole stavu dat portálu."
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {primary.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="Prodejny podle stavu"
          icon={MapPin}
          rows={Object.entries(locationsByStatus)
            .sort((a, b) => b[1] - a[1])
            .map(([key, count]) => ({
              label: locationStatusLabels[key] ?? key,
              count,
            }))}
          total={locations.length}
        />
        <BreakdownCard
          title="Uživatelé podle role"
          icon={Users}
          rows={Object.entries(usersByRole)
            .sort((a, b) => b[1] - a[1])
            .map(([key, count]) => ({
              label: roleLabels[key] ?? key,
              count,
            }))}
          total={users.length}
        />
      </div>
    </div>
  );
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, v) => {
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});
}

type StatCardProps = {
  label: string;
  value: number;
  Icon: LucideIcon;
  hint?: string;
};

function StatCard({ label, value, Icon, hint }: StatCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-edge bg-paper p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-ink-mid">
          {label}
        </span>
        <Icon className="h-4 w-4 text-ink-mid" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="text-[2rem] font-extrabold tracking-[-0.03em] text-ink-base tabular-nums">
        {fmt(value)}
      </div>
      {hint && (
        <p className="-mt-2 text-[11.5px] leading-snug text-ink-soft">{hint}</p>
      )}
    </div>
  );
}

function BreakdownCard({
  title,
  icon: Icon,
  rows,
  total,
}: {
  title: string;
  icon: LucideIcon;
  rows: { label: string; count: number }[];
  total: number;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-edge bg-paper p-6 md:p-7">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-ink-base text-paper">
          <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h2 className="text-[1rem] font-bold tracking-[-0.02em] text-ink-base">
          {title}
        </h2>
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-soft">Žádná data.</p>
      ) : (
        <dl className="flex flex-col divide-y divide-edge">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-2.5 text-[13.5px]"
            >
              <dt className="text-ink-deep">{row.label}</dt>
              <dd className="font-mono font-semibold text-ink-base tabular-nums">
                {fmt(row.count)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex items-center justify-between border-t border-edge pt-3 text-[12.5px]">
        <span className="font-medium uppercase tracking-[0.16em] text-ink-mid">
          Celkem
        </span>
        <span className="font-mono font-bold text-ink-base tabular-nums">
          {fmt(total)}
        </span>
      </div>
    </section>
  );
}
