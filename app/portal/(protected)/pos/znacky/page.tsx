import { Suspense } from "react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { posFilterFromSearchParams, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import { getBrandLeaderboardFull, getBrands } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { PosLeaderboard, type LeaderRow } from "@/components/portal/pos/PosLeaderboard";
import { LeaderboardSkeleton } from "@/components/portal/pos/skeletons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokladna - Značky" };

export default async function PosBrandsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const filter = posFilterFromSearchParams(await searchParams);
  if (!isPosApiConfigured()) {
    return <Notice title="POS data nejsou nakonfigurovaná" body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel)." />;
  }
  return (
    <Suspense fallback={<LeaderboardSkeleton rows={6} />}>
      <BrandsLeaderboard filter={filter} />
    </Suspense>
  );
}

async function BrandsLeaderboard({ filter }: { filter: PosFilter }) {
  let rows: Awaited<ReturnType<typeof getBrandLeaderboardFull>>;
  let brandsRaw: Awaited<ReturnType<typeof getBrands>>;
  try {
    [rows, brandsRaw] = await Promise.all([getBrandLeaderboardFull(filter), getBrands()]);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst data z API Data Warehouse." />;
  }

  if (rows.length === 0) {
    return <Notice title="Pro zvolené období nejsou data" body="Zkuste jiné období nebo měnu ve filtru nahoře." />;
  }

  const brandName = new Map(brandsRaw.map((b) => [b.id, b.name]));
  const useNet = !filter.vatInclusive;

  const leaderRows: LeaderRow[] = rows.map((r) => {
    const scoped = serializePosFilter({ ...filter, scope: { kind: "brand", brandId: r.brand_id } }).toString();
    return {
      id: r.brand_id,
      label: brandName.get(r.brand_id) ?? r.brand_id,
      href: `/portal/pos${scoped ? `?${scoped}` : ""}`,
      value: useNet ? r.net : r.gross,
      prev: useNet ? r.prevNet : r.prevGross,
      receipts: r.receipts,
      atv: r.receipts > 0 ? r.gross / r.receipts : null,
    };
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
        Značky ({leaderRows.length}) · {useNet ? "čisté tržby" : "tržby s DPH"} · {filter.currency}
      </h2>
      <PosLeaderboard rows={leaderRows} currency={filter.currency} valueLabel={useNet ? "Čisté tržby" : "Tržby"} />
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
