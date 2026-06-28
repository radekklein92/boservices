import { Suspense } from "react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { parsePosFilter, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import { getClosedStores, getLocationLeaderboardFull } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { PosSubNav } from "@/components/portal/pos/PosSubNav";
import { CONCEPT_LABEL } from "@/components/portal/locations/locations-shared";
import { PosLeaderboard, type LeaderRow } from "@/components/portal/pos/PosLeaderboard";
import { ClosedStoresLink } from "@/components/portal/pos/ClosedStoresPanel";
import { PosFilterBarLoader } from "@/components/portal/pos/PosFilterBarLoader";
import { FilterBarSkeleton, LeaderboardSkeleton } from "@/components/portal/pos/skeletons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tržby - Prodejny" };

function searchParamsToUsp(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") usp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") usp.set(k, v[0]);
  }
  return usp;
}

export default async function PosLocationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const filter = parsePosFilter(searchParamsToUsp(await searchParams));
  const backQs = serializePosFilter(filter).toString();

  return (
    <>
      <PageHeader
        eyebrow="Provoz"
        title="Prodejny"
        lede="Žebříček prodejen (součet pokladen) v rámci výběru a období."
      />

      <PosSubNav />

      <Suspense fallback={<FilterBarSkeleton />}>
        <PosFilterBarLoader filter={filter} />
      </Suspense>

      {!isPosApiConfigured() ? (
        <Notice title="POS data nejsou nakonfigurovaná" body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel)." />
      ) : (
        <Suspense fallback={<LeaderboardSkeleton rows={10} />}>
          <LocationsLeaderboard filter={filter} />
        </Suspense>
      )}
    </>
  );
}

async function LocationsLeaderboard({ filter }: { filter: PosFilter }) {
  let rows: Awaited<ReturnType<typeof getLocationLeaderboardFull>>;
  // Report neotevřených prodejen běží paralelně se žebříčkem; jeho pád (catch ->
  // null) jen schová odkaz, žebříček zůstane.
  let closed: Awaited<ReturnType<typeof getClosedStores>> | null;
  try {
    [rows, closed] = await Promise.all([
      getLocationLeaderboardFull(filter),
      getClosedStores(filter).catch(() => null),
    ]);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst žebříček z API Data Warehouse." />;
  }
  if (rows.length === 0) {
    return (
      <Notice title="Pro zvolený výběr nejsou data" body="Zkuste jiné období, výběr prodejen nebo měnu ve filtru nahoře." />
    );
  }

  const useNet = !filter.vatInclusive;
  const cur = rows[0]?.currency ?? filter.currency;
  const qs = serializePosFilter(filter).toString();
  const leaderRows: LeaderRow[] = rows.map((r) => {
    const pokladny = r.shopCount > 1 ? `${r.shopCount} pokladen` : null;
    const sub = [CONCEPT_LABEL[r.concept], pokladny].filter(Boolean).join(" · ");
    return {
      id: r.locationId,
      label: r.name,
      sublabel: sub || undefined,
      href: `/portal/pos/prodejny/${encodeURIComponent(r.locationId)}${qs ? `?${qs}` : ""}`,
      value: useNet ? r.net : r.gross,
      prev: useNet ? r.prevNet : r.prevGross,
      receipts: r.receipts,
      atv: r.receipts > 0 ? r.gross / r.receipts : null,
    };
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
          Prodejny ({leaderRows.length}) · {useNet ? "bez DPH" : "s DPH"} · {cur}
        </h2>
        {closed && <ClosedStoresLink report={closed} />}
      </div>
      <PosLeaderboard rows={leaderRows} currency={cur} valueLabel={useNet ? "Tržby bez DPH" : "Tržby s DPH"} />
    </section>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-edge bg-paper p-6">
      <div className="text-[14px] font-semibold text-ink-base">{title}</div>
      <p className="mt-1.5 max-w-[60ch] text-[13px] text-ink-mid">{body}</p>
    </div>
  );
}
