import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Coins,
  FileSignature,
  LineChart,
  PartyPopper,
  Sparkle,
  Star,
  type LucideIcon,
} from "lucide-react";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import {
  cachedGetClaimsOverlay,
  cachedGetClamoraClaims,
  cachedListContracts,
} from "@/lib/portal/cached-db";
import { clientSignedAtEffective } from "@/lib/portal/contracts-db";
import {
  buildAssignedClaimsView,
  buildContractClaimRefs,
  dedupeCompanyOptions,
  sumCompanies,
  KEY_DASHBOARD_COMPANIES,
} from "@/lib/portal/assigned-claims";
import { DEBTOR_PRESETS, EXTRA_CLAIM_COMPANIES } from "@/lib/portal/debtor-presets";
import { buildCommissionsView, isSalespersonEmail } from "@/lib/portal/commissions";
import { FireworksCelebration } from "@/components/portal/dashboard/FireworksCelebration";
import { AssignedClaimsPanel } from "@/components/portal/dashboard/AssignedClaimsPanel";
import { SalespersonCard } from "@/components/portal/commissions/SalespersonCard";
import { buildReTrendPoints, type ReTrendPoint } from "@/lib/portal/re-snapshots-db";
import { ReTrendPanel } from "@/components/portal/locations/ReTrendChart";

// Dashboard - jediný story: postup k cíli 100 franšízových lokalit.
//
// KPI:
//   1) Smluvy podepsané klientem (clientSignedAtEffective - vč. DigiSign mezistavu,
//      kdy klient už podepsal, ale obálka ještě nedoběhla)
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

const CELEBRATION_WINDOW_MS = 24 * 60 * 60 * 1000;

// Vrátí nejvyšší milník dosažený v posledních 24 hodinách - tj. okamžik, kdy
// N-tá podepsaná franšízová smlouva (seřazeno dle clientSignedAt) překročila
// daný milník, je méně než 24 h zpět. null = za posledních 24 h žádný milník.
function milestoneReachedRecently(
  contracts: Awaited<ReturnType<typeof cachedListContracts>>,
): number | null {
  const dates = contracts
    .filter(
      (c) => c.type === "franchise" && !!clientSignedAtEffective(c) && !c.cancelledAt,
    )
    .map((c) => clientSignedAtEffective(c) as string)
    .sort();
  if (!dates.length) return null;
  const cutoff = Date.now() - CELEBRATION_WINDOW_MS;
  let hit: number | null = null;
  for (const m of MILESTONES) {
    if (dates.length >= m && new Date(dates[m - 1]!).getTime() >= cutoff) {
      hit = m;
    }
  }
  return hit;
}

export default async function PortalDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ celebrate?: string }>;
}) {
  const [session, contracts, overlay, clamoraClaims, trendPoints, sp] =
    await Promise.all([
      getSession(),
      cachedListContracts(),
      cachedGetClaimsOverlay(),
      cachedGetClamoraClaims(),
      buildReTrendPoints(new Date()),
      searchParams,
    ]);
  const isAdmin = isAdminRole(session?.user?.role);
  // Provize vidí admini + sami obchodníci (Toman/Ebermann dle e-mailu).
  const canSeeCommissions =
    isAdmin || isSalespersonEmail(session?.user?.email);

  const signedByClientCount = contracts.filter(
    (c) => !!clientSignedAtEffective(c) && !c.cancelledAt,
  ).length;
  const franchiseLocationsCount = contracts.filter(
    (c) => c.type === "franchise" && !!clientSignedAtEffective(c) && !c.cancelledAt,
  ).length;

  // Oslavný ohňostroj: dnes padlý milník (pro všechny), nebo náhled přes
  // ?celebrate=N (jen admin - ať si to lze prohlédnout, jak to vypadá).
  const previewCelebrate = isAdmin && sp?.celebrate ? Number(sp.celebrate) : null;
  const celebrate =
    previewCelebrate && Number.isFinite(previewCelebrate) && previewCelebrate > 0
      ? previewCelebrate
      : milestoneReachedRecently(contracts);
  const festive = celebrate != null;

  // Postoupené pohledávky: agregace smluvních pohledávek (claim-bundle podepsané
  // klientem) + overlay vrstvy (ruční pohledávky + cross-ručení). Headline =
  // součet všech uplatnění (dlužník + každý potvrzený ručitel). Vše vč. DPH.
  const claimsView = buildAssignedClaimsView(contracts, overlay, clamoraClaims);
  // Ploché smluvní pohledávky pro editor cross-ručení (s plným kontextem) -
  // vč. zrcadlených z ClamoraPortal, ať jdou taky cross-ručit.
  const contractClaims = buildContractClaimRefs(contracts, clamoraClaims);
  // Nabídka firem do pickeru: nejdřív existující dlužníci z breakdownu (přesné
  // stringy, aby cross-ručení padlo na stejný řádek), pak presety a doplňkové.
  // dedupeCompanyOptions zahodí krátké duplicity firem, které už v breakdownu
  // jsou pod plným názvem (např. "Flowers International" vs "...s.r.o.").
  const companyOptions = dedupeCompanyOptions([
    ...claimsView.breakdown.map((b) => b.name),
    ...DEBTOR_PRESETS.map((p) => p.label),
    ...EXTRA_CLAIM_COMPANIES,
  ]);
  // Dlaždice ukazuje jen součet 3 klíčových firem (BBI + TD1 + FLW); celkový
  // součet je až v modalu.
  const keyCompaniesTotal = sumCompanies(
    claimsView.breakdown,
    KEY_DASHBOARD_COMPANIES,
  );

  // Provizní výsledky obchodníků (franšízy + postoupení u 3 klíčových firem).
  const commissionsView = buildCommissionsView(contracts, overlay);

  return (
    <div className="relative isolate flex flex-col gap-8">
      {celebrate != null && (
        <FireworksCelebration
          milestone={celebrate}
          isGoal={celebrate >= TARGET}
        />
      )}

      {/* Festivní režim (24 h od milníku / náhled): barevný nádech celého
          pravého obsahového panelu (fixní, od menu doprava - bez „rámu"). */}
      {festive && (
        <div
          aria-hidden="true"
          className="festive-bg pointer-events-none fixed inset-0 -z-10 md:left-64"
        />
      )}

      {festive && celebrate != null && (
        <FestiveBanner milestone={celebrate} isGoal={celebrate >= TARGET} />
      )}

      {/* HERO - milestone progress karta. Dominantní, hned nad foldem. */}
      <MilestoneHero count={franchiseLocationsCount} festive={festive} />

      {/* Vývoj Real Estate v čase - týdenní trend tří kategorií. */}
      <ReTrendCard points={trendPoints} />

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
        <AssignedClaimsPanel
          view={claimsView}
          keyTotal={keyCompaniesTotal}
          overlay={overlay}
          contractClaims={contractClaims}
          companyOptions={companyOptions}
          isAdmin={isAdmin}
        />
      </section>

      {/* Provizní výsledky obchodníků - jen admini + obchodníci (Toman/Ebermann). */}
      {canSeeCommissions && (
        <section>
          <div className="mb-5 flex items-center justify-between gap-3">
            <SectionLabel>Provizní výsledky</SectionLabel>
            <Link
              href="/portal/commissions"
              className="group inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
            >
              Detail a výběry
              <ArrowUpRight
                className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                strokeWidth={1.5}
              />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {commissionsView.bySalesperson.map((s) => (
              <SalespersonCard key={s.id} data={s} />
            ))}
          </div>
        </section>
      )}

      {festive && (
        <style>{`
          .festive-bg {
            background:
              radial-gradient(40% 48% at 10% 6%, rgba(244,63,94,0.20), transparent 70%),
              radial-gradient(44% 52% at 90% 3%, rgba(245,158,11,0.20), transparent 70%),
              radial-gradient(54% 62% at 86% 94%, rgba(16,185,129,0.20), transparent 72%),
              radial-gradient(50% 58% at 5% 97%, rgba(99,102,241,0.18), transparent 72%),
              radial-gradient(70% 70% at 50% 45%, rgba(236,72,153,0.07), transparent 78%);
          }
        `}</style>
      )}
    </div>
  );
}

// Vibrant celebratory gradient (sdílené pro hero číslo, lištu, banner).
const FESTIVE_GRADIENT =
  "linear-gradient(120deg, #f43f5e 0%, #f59e0b 32%, #10b981 64%, #6366f1 100%)";

// ─────────────────────────────────────────────────────────────────────
// FESTIVNÍ BANNER - oslavný pruh v den (24 h) milníku
// ─────────────────────────────────────────────────────────────────────

function FestiveBanner({
  milestone,
  isGoal,
}: {
  milestone: number;
  isGoal: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl px-6 py-4 text-paper shadow-[0_20px_50px_-24px_rgba(244,63,94,0.5)]"
      style={{ backgroundImage: FESTIVE_GRADIENT }}
    >
      <Star
        className="absolute -right-6 -top-6 h-28 w-28 text-white/15"
        strokeWidth={1}
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 backdrop-blur-sm">
          <PartyPopper className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/80">
            Oslava
          </div>
          <div className="mt-0.5 text-[1.05rem] font-bold tracking-[-0.01em] sm:text-[1.2rem]">
            {isGoal
              ? `Cíl ${milestone} lokalit s franšízou je splněn!`
              : `Dosáhli jsme milníku ${milestone} lokalit s franšízou!`}
          </div>
        </div>
      </div>
    </div>
  );
}

// Statické festivní konfety - decentní barevné tečky/čtverečky rozeseté v hero
// kartě. Bez animace (elegantní), pointer-events-none.
function FestiveSprinkles() {
  const dots: Array<{
    top: string;
    left: string;
    c: string;
    s: number;
    sq?: boolean;
    r?: number;
  }> = [
    { top: "13%", left: "5%", c: "#f43f5e", s: 8, sq: true, r: 18 },
    { top: "22%", left: "93%", c: "#6366f1", s: 7 },
    { top: "70%", left: "3.5%", c: "#10b981", s: 6, sq: true, r: -20 },
    { top: "9%", left: "58%", c: "#f59e0b", s: 5 },
    { top: "84%", left: "68%", c: "#ec4899", s: 7, sq: true, r: 35 },
    { top: "42%", left: "96%", c: "#f59e0b", s: 6 },
    { top: "90%", left: "28%", c: "#6366f1", s: 5, sq: true, r: -12 },
    { top: "32%", left: "1.5%", c: "#10b981", s: 5 },
    { top: "60%", left: "94%", c: "#f43f5e", s: 6, sq: true, r: 25 },
    { top: "6%", left: "40%", c: "#10b981", s: 4 },
  ];
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {dots.map((d, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: d.top,
            left: d.left,
            width: d.s,
            height: d.s,
            background: d.c,
            borderRadius: d.sq ? 1 : 9999,
            transform: d.sq && d.r ? `rotate(${d.r}deg)` : undefined,
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// REAL ESTATE TREND - karta s týdenním vývojem (Řešit/Vyřešeno/Červeně)
// ─────────────────────────────────────────────────────────────────────

function ReTrendCard({ points }: { points: ReTrendPoint[] }) {
  return (
    <section className="rounded-3xl border border-edge bg-paper p-6 sm:p-7">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          <span
            aria-hidden="true"
            className="mr-3 inline-block h-px w-6 translate-y-[-3px] bg-ink-base/50 align-middle"
          />
          Real Estate v čase
        </div>
        <Link
          href="/portal/real-estate"
          className="group inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
        >
          <LineChart className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Detail
          <ArrowUpRight
            className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            strokeWidth={1.5}
          />
        </Link>
      </div>
      <ReTrendPanel points={points} variant="compact" />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HERO MILESTONE - dominantní karta s velkým číslem a barem
// ─────────────────────────────────────────────────────────────────────

function MilestoneHero({ count, festive = false }: { count: number; festive?: boolean }) {
  const goalReached = count >= TARGET;
  const progressPct = Math.min((count / TARGET) * 100, 100);
  const nextMilestone = MILESTONES.find((m) => count < m);
  const remainingToNext = nextMilestone ? nextMilestone - count : 0;

  return (
    <section
      className={[
        "relative overflow-hidden rounded-[28px] border bg-paper p-6 sm:rounded-[32px] sm:p-8 md:p-12",
        goalReached
          ? "border-emerald-600 shadow-[0_30px_60px_-30px_rgba(5,150,105,0.35)]"
          : festive
            ? "border-edge shadow-[0_30px_90px_-40px_rgba(244,63,94,0.4)]"
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

      {/* Festivní konfety - dekorace karty (statické, decentní). */}
      {festive && <FestiveSprinkles />}

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
        <Link
          href="/portal/contracts?type=franchise&status=podepsano-klientem,archivovano"
          className="group -m-2 block rounded-2xl p-2 outline-none transition-colors hover:bg-ink-base/[0.03] focus-visible:ring-2 focus-visible:ring-ink-base/30"
          title="Zobrazit podepsané franšízingové smlouvy"
        >
          <div className="flex items-end gap-3 leading-none tracking-[-0.05em]">
            <div
              className={[
                "font-extrabold text-[clamp(5rem,14vw,9rem)] leading-[0.85]",
                festive ? "bg-clip-text text-transparent" : "text-ink-base",
              ].join(" ")}
              style={festive ? { backgroundImage: FESTIVE_GRADIENT } : undefined}
            >
              {count.toLocaleString("cs-CZ")}
            </div>
            <div className="flex items-end gap-1 pb-3 text-[clamp(1.25rem,2.4vw,1.75rem)] font-bold text-ink-soft">
              <span>/</span>
              <span>{TARGET}</span>
            </div>
            <ArrowUpRight
              className="mb-3 h-5 w-5 shrink-0 self-end text-ink-soft opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
          <div className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-ink-mid">
            Franšízových smluv podepsaných klientem. Každá podepsaná smlouva
            je další lokalita v síti.
          </div>
        </Link>

        {/* Right side: next milestone callout */}
        <div className="w-full sm:w-auto sm:min-w-[200px]">
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

      {/* MILESTONE BAR - clean coord system:
          Outer wrapper (px-5 sm:px-7) má padding = half max dot size.
          Inner div je relative bar od 0% (vlevo) do 100% (vpravo).
          Dots/labels pozicované přes left:${m}% s translate(-50%) -
          jejich polovina přesahuje do outer paddingu, takže dot na 100%
          má pravý okraj přesně na pravém kraji karty.
      */}
      <div className="relative mt-10 pb-1 pt-10 sm:mt-12 sm:pt-12">
        <div className="px-5 sm:px-7">
          <div className="relative">
            {/* Floating pill aktuální hodnoty */}
            {count > 0 && !goalReached && (
              <div
                className="pointer-events-none absolute z-20 flex -translate-y-full flex-col items-center pb-2"
                style={{
                  left: `${Math.min(count, 100)}%`,
                  transform: "translateX(-50%)",
                  top: "-2px",
                }}
              >
                <div className="rounded-full bg-ink-base px-3 py-1 text-[11.5px] font-bold tracking-tight text-paper shadow-[0_6px_16px_-4px_rgba(14,14,14,0.4)] sm:px-3.5 sm:py-1.5 sm:text-[12.5px]">
                  {count}
                </div>
                <div aria-hidden="true" className="h-3 w-px bg-ink-base/40" />
              </div>
            )}

            {/* Track + dots area */}
            <div className="relative h-10 sm:h-14">
              {/* Background track */}
              <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-edge sm:h-[5px]" />
              {/* Filled progress */}
              <div
                className={[
                  "absolute left-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full transition-all duration-1000 ease-out sm:h-[5px]",
                  goalReached
                    ? "bg-emerald-600 shadow-[0_0_28px_rgba(5,150,105,0.45)]"
                    : festive
                      ? "shadow-[0_0_24px_rgba(245,158,11,0.55)]"
                      : "bg-ink-base",
                ].join(" ")}
                style={{
                  width: `${Math.min(progressPct, 100)}%`,
                  ...(festive && !goalReached
                    ? { backgroundImage: FESTIVE_GRADIENT }
                    : {}),
                }}
              />

              {/* Milestone dots */}
              {MILESTONES.map((m) => {
                const reached = count >= m;
                const isTarget = m === TARGET;
                const isNext = !reached && nextMilestone === m;
                return (
                  <div
                    key={m}
                    className="absolute top-1/2"
                    style={{
                      left: `${m}%`,
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

            {/* Labels pod tečkami - na mobilu jen číslo, na desktopu i status text */}
            <div className="relative mt-2 h-7 sm:mt-3 sm:h-10">
              {MILESTONES.map((m) => {
                const reached = count >= m;
                const isTarget = m === TARGET;
                return (
                  <div
                    key={m}
                    className="absolute top-0 flex flex-col items-center whitespace-nowrap"
                    style={{
                      left: `${m}%`,
                      transform: "translateX(-50%)",
                    }}
                  >
                    <span
                      className={[
                        "text-[12px] font-bold leading-none tracking-tight sm:text-[15px]",
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
                        "mt-1 hidden text-[9px] font-semibold uppercase tracking-[0.2em] sm:block",
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
        </div>
      </div>

      <style>{`
        @keyframes pulseRing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(14,14,14,0.18); }
          50% { box-shadow: 0 0 0 10px rgba(14,14,14,0); }
        }
        .ms-pulse {
          animation: pulseRing 2.4s ease-in-out infinite;
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
  // Star dot (100) - h-10 na mobile, h-14 (56px) na desktop. Mobile padding
  // outer baru je px-5 (20px) = half star, desktop px-7 (28px) = half star.
  if (isTarget) {
    return (
      <div
        className={[
          "relative z-10 grid h-10 w-10 place-items-center rounded-full transition-all duration-300 sm:h-14 sm:w-14",
          reached
            ? "bg-emerald-600 text-paper shadow-[0_0_0_6px_rgba(5,150,105,0.18),0_8px_24px_-4px_rgba(5,150,105,0.45)] sm:shadow-[0_0_0_8px_rgba(5,150,105,0.18),0_8px_24px_-4px_rgba(5,150,105,0.45)]"
            : "border-2 border-ink-base bg-paper text-ink-base shadow-[0_0_0_4px_rgba(14,14,14,0.06)] sm:shadow-[0_0_0_8px_rgba(14,14,14,0.06),0_4px_12px_-2px_rgba(14,14,14,0.12)]",
        ].join(" ")}
      >
        <Star
          className="h-4 w-4 sm:h-6 sm:w-6"
          strokeWidth={2}
          fill={reached ? "currentColor" : "none"}
          aria-hidden="true"
        />
      </div>
    );
  }
  // Regular milestones - h-9 mobile / h-12 desktop.
  return (
    <div
      className={[
        "relative z-10 grid h-9 w-9 place-items-center rounded-full transition-all duration-300 sm:h-12 sm:w-12",
        reached
          ? "bg-emerald-600 text-paper shadow-[0_4px_10px_-2px_rgba(5,150,105,0.45)] sm:shadow-[0_6px_16px_-2px_rgba(5,150,105,0.45)]"
          : isNext
            ? "border-2 border-ink-base bg-paper text-ink-base ms-pulse"
            : "border border-edge bg-paper text-ink-soft",
      ].join(" ")}
      aria-hidden="true"
    >
      {reached ? (
        <Check className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.75} aria-hidden="true" />
      ) : (
        <span
          className={[
            "h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2",
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
      className="group relative overflow-hidden rounded-3xl border border-edge bg-paper p-7 transition-colors hover:border-ink-soft"
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

