import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  FileSignature,
  MapPin,
  Plus,
  Sparkle,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import {
  cachedListContracts,
} from "@/lib/portal/cached-db";

// Dashboard je zaměřený na 2 KPI:
//  1. Celkový počet smluv podepsaných klientem (clientSignedAt set)
//  2. Lokality s franšízou = počet franchise smluv (AB + B) podepsaných
//     klientem (1 smlouva = 1 lokalita, žádná dedup podle adresy)
// Plus milestone progress bar do cílové mety 100 lokalit (15/30/50/75/100).

export const dynamic = "force-dynamic";

const MILESTONES = [15, 30, 50, 75, 100] as const;
const TARGET = 100;

export default async function PortalDashboardPage() {
  const [session, contracts] = await Promise.all([
    getSession(),
    cachedListContracts(),
  ]);
  const isAdmin = isAdminRole(session?.user?.role);

  const signedByClientCount = contracts.filter((c) => !!c.clientSignedAt).length;
  const franchiseLocationsCount = contracts.filter(
    (c) => c.type === "franchise" && !!c.clientSignedAt,
  ).length;

  const displayName =
    session?.user?.name?.split(/\s+/)[0] ?? session?.user?.email ?? "uživateli";
  const today = new Date().toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const goalReached = franchiseLocationsCount >= TARGET;
  const nextMilestone = MILESTONES.find((m) => franchiseLocationsCount < m);
  const remainingToNext = nextMilestone
    ? nextMilestone - franchiseLocationsCount
    : 0;

  return (
    <div className="flex flex-col gap-14">
      <PageHeader
        eyebrow="Dashboard"
        title={`Vítejte, ${displayName}.`}
        lede={today}
      />

      {/* HERO STATS - 2 obří čísla side-by-side */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <HeroStat
          eyebrow="Podepsané smlouvy"
          value={signedByClientCount}
          caption={
            signedByClientCount === 0
              ? "ještě žádná podepsaná smlouva"
              : signedByClientCount === 1
                ? "smlouva, kterou klient podepsal"
                : signedByClientCount < 5
                  ? "smlouvy, které klient podepsal"
                  : "smluv, které klient podepsal"
          }
          Icon={FileSignature}
        />
        <HeroStat
          eyebrow="Lokality s franšízou"
          value={franchiseLocationsCount}
          caption={`z cílových ${TARGET} lokalit`}
          Icon={MapPin}
          goalReached={goalReached}
          highlightTarget
        />
      </section>

      {/* MILESTONE PROGRESS - dominantní vizuální prvek */}
      <section>
        <SectionLabel>
          {goalReached
            ? "Cíl dosažen"
            : `Postup k cíli ${TARGET} lokalit`}
        </SectionLabel>
        <div className="mt-5 rounded-[28px] border border-edge bg-paper p-7 md:p-10">
          <MilestoneBar count={franchiseLocationsCount} />
          <div className="mt-9 flex flex-wrap items-baseline justify-between gap-3 border-t border-edge pt-6">
            <div className="text-[13.5px] text-ink-deep">
              {goalReached ? (
                <span className="font-semibold text-ink-base">
                  Cíl {TARGET} lokalit dosažen ({franchiseLocationsCount}).
                  Skvělá práce.
                </span>
              ) : nextMilestone ? (
                <>
                  Příští milník je{" "}
                  <span className="font-bold text-ink-base">
                    {nextMilestone}
                  </span>{" "}
                  - chybí{" "}
                  <span className="font-bold text-ink-base">
                    {remainingToNext}{" "}
                    {remainingToNext === 1
                      ? "smlouva"
                      : remainingToNext < 5
                        ? "smlouvy"
                        : "smluv"}
                  </span>
                  .
                </>
              ) : (
                "Pokračujte v podepisování."
              )}
            </div>
            <Link
              href="/portal/contracts"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-base transition-transform hover:translate-x-0.5"
            >
              Přejít na smlouvy
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Link>
          </div>
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
              body="Reset hesla, změna role, odebrání přístupu - vše v jednom přehledu."
              Icon={Users}
            />
          </div>
        </section>
      )}
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

// Hero stat - obří číslo + eyebrow + caption. Volitelně highlightuje
// "cíl/meta" badge pro statistiku s milestoney.
function HeroStat({
  eyebrow,
  value,
  caption,
  Icon,
  goalReached = false,
  highlightTarget = false,
}: {
  eyebrow: string;
  value: number;
  caption: string;
  Icon: LucideIcon;
  goalReached?: boolean;
  highlightTarget?: boolean;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[28px] border bg-paper p-8 transition-colors md:p-10",
        goalReached
          ? "border-emerald-600 shadow-[0_18px_42px_-22px_rgba(5,150,105,0.45)]"
          : "border-edge hover:border-ink-soft",
      ].join(" ")}
    >
      {/* Background icon - decorative, low contrast */}
      <Icon
        className={[
          "absolute -bottom-6 -right-6 h-44 w-44 transition-opacity",
          goalReached ? "text-emerald-600/8" : "text-ink-base/[0.04]",
        ].join(" ")}
        strokeWidth={1}
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          {eyebrow}
        </div>
        <div className="mt-7 flex items-baseline gap-3">
          <div className="font-extrabold leading-none tracking-[-0.045em] text-ink-base text-[clamp(3.5rem,9vw,5.5rem)]">
            {value.toLocaleString("cs-CZ")}
          </div>
          {highlightTarget && (
            <div className="flex items-baseline gap-1 text-[14px] font-semibold text-ink-mid">
              <span className="opacity-50">/</span>
              <span className="text-ink-deep">{TARGET}</span>
              <Star
                className={[
                  "ml-0.5 h-3.5 w-3.5 translate-y-px",
                  goalReached ? "text-emerald-600" : "text-ink-soft",
                ].join(" ")}
                strokeWidth={2}
                fill={goalReached ? "currentColor" : "none"}
                aria-hidden="true"
              />
            </div>
          )}
        </div>
        <div className="mt-3 max-w-[42ch] text-[13.5px] leading-relaxed text-ink-mid">
          {caption}
        </div>
        {goalReached && (
          <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-paper">
            <Sparkle className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
            Cíl dosažen
          </div>
        )}
      </div>
    </div>
  );
}

// Horizontal milestone progress bar. Dots na 15, 30, 50, 75, 100%
// (= relativní pozice k cílové metě). 100 má vždy Star ikonu jako "cíl".
function MilestoneBar({ count }: { count: number }) {
  const progressPct = Math.min((count / TARGET) * 100, 100);

  return (
    <div className="relative">
      {/* Current value floating above current position */}
      <div className="relative mb-7 h-7">
        <div
          className="absolute"
          style={{
            left: `${Math.min(progressPct, 96)}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="flex flex-col items-center">
            <div className="rounded-full bg-ink-base px-3 py-1 text-[12px] font-bold tracking-tight text-paper shadow-[0_4px_10px_-2px_rgba(14,14,14,0.3)]">
              {count}
            </div>
            <div
              aria-hidden="true"
              className="h-2 w-px bg-ink-base/50"
            />
          </div>
        </div>
      </div>

      {/* Track + progress fill + dots */}
      <div className="relative">
        {/* Background track */}
        <div className="absolute left-3 right-3 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-edge" />
        {/* Filled progress */}
        <div
          className="absolute left-3 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink-base transition-all duration-700 ease-out"
          style={{
            width: `calc(${progressPct}% - 24px * ${progressPct / 100})`,
            minWidth: 0,
          }}
        />

        {/* Milestone dots */}
        <ol className="relative flex items-center justify-between">
          {MILESTONES.map((m) => {
            const reached = count >= m;
            const isTarget = m === TARGET;
            return (
              <li
                key={m}
                className="flex flex-col items-center"
                style={{ width: 48 }}
              >
                <MilestoneDot
                  milestone={m}
                  reached={reached}
                  isTarget={isTarget}
                />
                <div className="mt-3 flex flex-col items-center gap-0.5">
                  <span
                    className={[
                      "text-[15px] font-bold leading-none tracking-tight",
                      reached ? "text-ink-base" : "text-ink-mid",
                      isTarget && !reached ? "text-ink-deep" : "",
                    ].join(" ")}
                  >
                    {m}
                  </span>
                  <span
                    className={[
                      "text-[9.5px] font-semibold uppercase tracking-[0.16em]",
                      isTarget
                        ? reached
                          ? "text-emerald-700"
                          : "text-ink-mid"
                        : reached
                          ? "text-ink-mid"
                          : "text-ink-soft",
                    ].join(" ")}
                  >
                    {isTarget ? "Cíl" : reached ? "Hotovo" : "Milník"}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function MilestoneDot({
  milestone: _m,
  reached,
  isTarget,
}: {
  milestone: number;
  reached: boolean;
  isTarget: boolean;
}) {
  // 100★ target dot: vždy distinct, větší, s Star ikonou.
  if (isTarget) {
    return (
      <div
        className={[
          "relative z-10 grid h-11 w-11 place-items-center rounded-full transition-all duration-300",
          reached
            ? "bg-emerald-600 text-paper ring-4 ring-emerald-600/15"
            : "border-2 border-ink-base bg-paper text-ink-base ring-4 ring-ink-base/10",
        ].join(" ")}
        aria-label="Cíl 100 lokalit"
      >
        <Star
          className="h-5 w-5"
          strokeWidth={2}
          fill={reached ? "currentColor" : "none"}
          aria-hidden="true"
        />
      </div>
    );
  }

  // Regular milestones: dosažené = emerald s Check, ostatní = paper + edge border
  return (
    <div
      className={[
        "relative z-10 grid h-9 w-9 place-items-center rounded-full transition-all duration-300",
        reached
          ? "bg-emerald-600 text-paper"
          : "border border-edge bg-paper text-ink-soft",
      ].join(" ")}
      aria-hidden="true"
    >
      {reached ? (
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-ink-soft" />
      )}
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
