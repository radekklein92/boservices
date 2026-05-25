import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  FileSignature,
  Plus,
  Sparkle,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { cachedListContracts } from "@/lib/portal/cached-db";

// Dashboard - jediný story: postup k cíli 100 franšízových lokalit.
//
// KPI:
//   1) Smluvy podepsané klientem (clientSignedAt set)
//   2) Lokality s franšízou = počet franchise smluv podepsaných klientem
//      (1 smlouva = 1 lokalita)
//
// Milestone bar je hlavní vizuální prvek - dominantní hero karta v top
// of fold. Tečky jsou POSITIONED ABSOLUTELY na své skutečné hodnotě
// (15% z 0-100), nikoli equally-spaced - jinak by aktuální pozice
// nesouhlasila s milníky.

export const dynamic = "force-dynamic";

const MILESTONES = [15, 30, 50, 75, 100] as const;
const TARGET = 100;

export default async function PortalDashboardPage() {
  const [session, contracts] = await Promise.all([
    getSession(),
    cachedListContracts(),
  ]);
  const isAdmin = isAdminRole(session?.user?.role);

  const signedByClientCount = contracts.filter(
    (c) => !!c.clientSignedAt,
  ).length;
  const franchiseLocationsCount = contracts.filter(
    (c) => c.type === "franchise" && !!c.clientSignedAt,
  ).length;

  const displayName =
    session?.user?.name?.split(/\s+/)[0] ??
    session?.user?.email ??
    "uživateli";
  const today = new Date().toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Dashboard"
        title={`Vítejte, ${displayName}.`}
        lede={today}
      />

      {/* HERO - milestone progress karta. Dominantní, hned nad foldem. */}
      <MilestoneHero count={franchiseLocationsCount} />

      {/* Sekundární stat: podepsané smlouvy celkem. */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <SecondaryStat
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
          href="/portal/contracts"
        />
        <NextMilestonePanel count={franchiseLocationsCount} />
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

// ─────────────────────────────────────────────────────────────────────
// HERO MILESTONE - dominantní karta s velkým číslem a barem
// ─────────────────────────────────────────────────────────────────────

function MilestoneHero({ count }: { count: number }) {
  const goalReached = count >= TARGET;
  const progressPct = Math.min((count / TARGET) * 100, 100);
  const nextMilestone = MILESTONES.find((m) => count < m);
  const remainingToNext = nextMilestone ? nextMilestone - count : 0;

  return (
    <section
      className={[
        "relative overflow-hidden rounded-[32px] border bg-paper p-8 md:p-12",
        goalReached
          ? "border-emerald-600 shadow-[0_30px_60px_-30px_rgba(5,150,105,0.35)]"
          : "border-edge shadow-[0_20px_60px_-30px_rgba(14,14,14,0.12)]",
      ].join(" ")}
    >
      {/* Decorative background star - very subtle */}
      <Star
        className={[
          "absolute -bottom-12 -right-12 h-72 w-72 transition-colors",
          goalReached
            ? "text-emerald-600/[0.08]"
            : "text-ink-base/[0.025]",
        ].join(" ")}
        strokeWidth={0.5}
        aria-hidden="true"
      />

      {/* Top row: eyebrow + Cíl badge */}
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.24em] text-ink-mid">
          <span
            aria-hidden="true"
            className="mr-3 inline-block h-px w-6 translate-y-[-3px] bg-ink-base/50 align-middle"
          />
          Lokality s franšízou
        </div>
        <div
          className={[
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.18em]",
            goalReached
              ? "border-emerald-600 bg-emerald-600 text-paper"
              : "border-ink-base bg-paper text-ink-base",
          ].join(" ")}
        >
          <Star
            className="h-3 w-3"
            strokeWidth={2.25}
            fill={goalReached ? "currentColor" : "none"}
            aria-hidden="true"
          />
          Cíl {TARGET}
        </div>
      </div>

      {/* Massive number block */}
      <div className="relative mt-10 flex flex-wrap items-end justify-between gap-8">
        <div>
          <div className="flex items-end gap-3 leading-none tracking-[-0.05em]">
            <div className="font-extrabold text-ink-base text-[clamp(5rem,14vw,9rem)] leading-[0.85]">
              {count.toLocaleString("cs-CZ")}
            </div>
            <div className="flex items-end gap-1 pb-3 text-[clamp(1.25rem,2.4vw,1.75rem)] font-bold text-ink-soft">
              <span>/</span>
              <span>{TARGET}</span>
            </div>
          </div>
          <div className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-ink-mid">
            Franšízových smluv podepsaných klientem. Každá podepsaná smlouva
            je další lokalita v síti.
          </div>
        </div>

        {/* Right side: next milestone callout */}
        <div className="min-w-[200px]">
          {goalReached ? (
            <div className="inline-flex flex-col items-start gap-2 rounded-2xl border border-emerald-600 bg-emerald-50/40 px-5 py-4">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-paper">
                <Sparkle className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
                Cíl dosažen
              </div>
              <div className="text-[13px] leading-relaxed text-ink-deep">
                Skvělá práce. Síť dosáhla {count} podepsaných lokalit.
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-edge bg-paper-warm px-5 py-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-mid">
                Příští milník
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <div className="text-[2rem] font-extrabold leading-none tracking-tight text-ink-base">
                  {nextMilestone}
                </div>
                <div className="text-[12px] font-medium text-ink-mid">
                  chybí {remainingToNext}{" "}
                  {remainingToNext === 1
                    ? "smlouva"
                    : remainingToNext < 5
                      ? "smlouvy"
                      : "smluv"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MILESTONE BAR - absolutně pozicované tečky podle skutečné hodnoty.
          Track má outer padding pro star dot, který přesahuje. */}
      <div className="relative mt-12 px-6 pb-2 pt-12 md:px-8">
        {/* Floating "aktuální hodnota" pill nad barem - pozice exact % */}
        {count > 0 && (
          <div
            className="absolute top-0 z-20"
            style={{
              left: `calc(${24}px + ${progressPct}% * (1 - ${48 / 100}))`,
              // ↑ Bar uvnitř má padding 24px na každé straně; pill se počítá
              // proporcionálně. 48 = 2× 24 (pad), proto škála lineární mezi
              // 24px (0%) a (100% - 24px) (100%).
              transform: "translateX(-50%)",
              maxWidth: "calc(100% - 24px)",
            }}
          >
            <div className="flex flex-col items-center">
              <div className="rounded-full bg-ink-base px-3.5 py-1.5 text-[12.5px] font-bold tracking-tight text-paper shadow-[0_6px_16px_-4px_rgba(14,14,14,0.4)]">
                {count}
              </div>
              <div
                aria-hidden="true"
                className="h-3 w-px bg-ink-base/40"
              />
            </div>
          </div>
        )}

        {/* Track and progress */}
        <div className="relative h-12">
          {/* Background track */}
          <div className="absolute left-6 right-6 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-edge md:left-8 md:right-8" />
          {/* Filled progress - absolutně pozicovaná podle pct */}
          <div
            className={[
              "absolute left-6 top-1/2 h-[6px] -translate-y-1/2 rounded-full transition-all duration-1000 ease-out md:left-8",
              goalReached
                ? "bg-emerald-600 shadow-[0_0_24px_rgba(5,150,105,0.4)]"
                : "bg-ink-base",
            ].join(" ")}
            style={{
              width: `calc(${progressPct}% - ${progressPct === 0 ? 0 : progressPct === 100 ? 48 : (progressPct / 100) * 48}px)`,
            }}
          />

          {/* Milestone dots - každý pozicovaný absolutně na svou % hodnotu */}
          {MILESTONES.map((m) => {
            const reached = count >= m;
            const isTarget = m === TARGET;
            const isNext = !reached && nextMilestone === m;
            return (
              <div
                key={m}
                className="absolute top-1/2 -translate-y-1/2"
                style={{
                  // Bar má padding-x 24px (md:32px). Pozice "m%" je proporcionálně
                  // mezi těmi dvěma okraji.
                  left: `calc(24px + ${m}% * (1 - ${48 / 100}))`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <MilestoneDot
                  milestone={m}
                  reached={reached}
                  isTarget={isTarget}
                  isNext={isNext}
                />
              </div>
            );
          })}
        </div>

        {/* Labels pod tečkami - také absolutně pozicované */}
        <div className="relative mt-2 h-10">
          {MILESTONES.map((m) => {
            const reached = count >= m;
            const isTarget = m === TARGET;
            return (
              <div
                key={m}
                className="absolute top-0 flex flex-col items-center"
                style={{
                  left: `calc(24px + ${m}% * (1 - ${48 / 100}))`,
                  transform: "translateX(-50%)",
                }}
              >
                <span
                  className={[
                    "text-[15px] font-bold leading-none tracking-tight",
                    reached
                      ? isTarget
                        ? "text-emerald-700"
                        : "text-ink-base"
                      : isTarget
                        ? "text-ink-base"
                        : "text-ink-mid",
                  ].join(" ")}
                >
                  {m}
                </span>
                <span
                  className={[
                    "mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em]",
                    isTarget
                      ? reached
                        ? "text-emerald-700"
                        : "text-ink-base"
                      : reached
                        ? "text-emerald-700"
                        : "text-ink-soft",
                  ].join(" ")}
                >
                  {isTarget ? "Cíl" : reached ? "Hotovo" : "Milník"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes pulseRing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(14,14,14,0.15); }
          50% { box-shadow: 0 0 0 8px rgba(14,14,14,0); }
        }
        .ms-pulse {
          animation: pulseRing 2.2s ease-in-out infinite;
        }
      `}</style>
    </section>
  );
}

function MilestoneDot({
  milestone: _m,
  reached,
  isTarget,
  isNext,
}: {
  milestone: number;
  reached: boolean;
  isTarget: boolean;
  isNext: boolean;
}) {
  if (isTarget) {
    return (
      <div
        className={[
          "relative z-10 grid h-12 w-12 place-items-center rounded-full transition-all duration-300",
          reached
            ? "bg-emerald-600 text-paper shadow-[0_0_0_6px_rgba(5,150,105,0.18)]"
            : "border-2 border-ink-base bg-paper text-ink-base shadow-[0_0_0_6px_rgba(14,14,14,0.06)]",
        ].join(" ")}
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
  return (
    <div
      className={[
        "relative z-10 grid h-10 w-10 place-items-center rounded-full transition-all duration-300",
        reached
          ? "bg-emerald-600 text-paper shadow-[0_4px_12px_-2px_rgba(5,150,105,0.4)]"
          : isNext
            ? "border-2 border-ink-base bg-paper text-ink-base ms-pulse"
            : "border border-edge bg-paper text-ink-soft",
      ].join(" ")}
      aria-hidden="true"
    >
      {reached ? (
        <Check className="h-4 w-4" strokeWidth={2.75} aria-hidden="true" />
      ) : (
        <span
          className={[
            "h-2 w-2 rounded-full",
            isNext ? "bg-ink-base" : "bg-ink-soft",
          ].join(" ")}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SECONDARY STAT karta + NextMilestonePanel
// ─────────────────────────────────────────────────────────────────────

function SecondaryStat({
  eyebrow,
  value,
  caption,
  Icon,
  href,
}: {
  eyebrow: string;
  value: number;
  caption: string;
  Icon: LucideIcon;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-[24px] border border-edge bg-paper p-7 transition-colors hover:border-ink-soft"
    >
      <Icon
        className="absolute -bottom-4 -right-4 h-32 w-32 text-ink-base/[0.04]"
        strokeWidth={1}
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
            <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            {eyebrow}
          </div>
          <ArrowUpRight
            className="h-4 w-4 text-ink-mid transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            strokeWidth={1.5}
          />
        </div>
        <div className="mt-5 font-extrabold leading-none tracking-[-0.045em] text-ink-base text-[clamp(2.5rem,6vw,3.5rem)]">
          {value.toLocaleString("cs-CZ")}
        </div>
        <div className="mt-2.5 text-[13px] text-ink-mid">{caption}</div>
      </div>
    </Link>
  );
}

function NextMilestonePanel({ count }: { count: number }) {
  const goalReached = count >= TARGET;
  const nextMilestone = MILESTONES.find((m) => count < m);
  const remainingToNext = nextMilestone ? nextMilestone - count : 0;
  const prevMilestone = [...MILESTONES].reverse().find((m) => count >= m) ?? 0;

  // Per-milestone progress fragment: kolik chybí do dalšího.
  const segmentSize = (nextMilestone ?? TARGET) - prevMilestone;
  const segmentProgress =
    segmentSize > 0
      ? Math.max(0, ((count - prevMilestone) / segmentSize) * 100)
      : 100;

  if (goalReached) {
    return (
      <div className="relative overflow-hidden rounded-[24px] border border-emerald-600 bg-paper p-7">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-emerald-700">
          <Sparkle
            className="mr-1.5 inline-block h-3.5 w-3.5 translate-y-px"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          Cíl dosažen
        </div>
        <div className="mt-3 text-[15px] leading-relaxed text-ink-deep">
          Síť 100 franšízových lokalit. Skvělá práce, tým.
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-edge bg-paper p-7">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
        Závěr k milníku
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="font-extrabold leading-none tracking-[-0.045em] text-ink-base text-[clamp(2.5rem,6vw,3.5rem)]">
          {remainingToNext}
        </div>
        <div className="text-[15px] font-semibold text-ink-mid">
          {remainingToNext === 1
            ? "smlouva"
            : remainingToNext < 5
              ? "smlouvy"
              : "smluv"}{" "}
          do{" "}
          <span className="font-bold text-ink-base">{nextMilestone}</span>
        </div>
      </div>

      {/* Mini progress segment od posledního milníku k dalšímu */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between text-[11px] font-medium text-ink-mid">
          <span>{prevMilestone}</span>
          <span>{nextMilestone}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-edge">
          <div
            className="h-full rounded-full bg-ink-base transition-all duration-700 ease-out"
            style={{ width: `${Math.min(segmentProgress, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────

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
