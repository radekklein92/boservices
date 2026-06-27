import { Suspense } from "react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { posFilterFromSearchParams, type PosFilter } from "@/lib/portal/pos/filters";
import { getShopLeaderboardFull } from "@/lib/portal/pos/queries";
import { buildPairingIndex } from "@/lib/portal/pos/pairing-db";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { PosLeaderboard, type LeaderRow } from "@/components/portal/pos/PosLeaderboard";
import { LeaderboardSkeleton } from "@/components/portal/pos/skeletons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokladna - Města" };

type Agg = { gross: number; net: number; receipts: number; prevGross: number; prevNet: number; hasPrev: boolean };

export default async function PosCitiesPage({
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
    <Suspense fallback={<LeaderboardSkeleton rows={8} />}>
      <CitiesLeaderboard filter={filter} />
    </Suspense>
  );
}

async function CitiesLeaderboard({ filter }: { filter: PosFilter }) {
  let rows: Awaited<ReturnType<typeof getShopLeaderboardFull>>;
  let pairing: Awaited<ReturnType<typeof buildPairingIndex>>;
  try {
    [rows, pairing] = await Promise.all([getShopLeaderboardFull(filter), buildPairingIndex()]);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst data z API Data Warehouse." />;
  }

  // Seskupení poboček podle města z párování. Nenapárované město -> "Neuvedeno".
  const byCity = new Map<string, Agg>();
  for (const r of rows) {
    const city = pairing.cityByShop.get(r.shop_id) || "Neuvedeno";
    const a = byCity.get(city) ?? { gross: 0, net: 0, receipts: 0, prevGross: 0, prevNet: 0, hasPrev: false };
    a.gross += r.gross;
    a.net += r.net;
    a.receipts += r.receipts;
    if (r.prevGross != null) {
      a.prevGross += r.prevGross;
      a.prevNet += r.prevNet ?? 0;
      a.hasPrev = true;
    }
    byCity.set(city, a);
  }

  if (byCity.size === 0) {
    return <Notice title="Pro zvolené období nejsou data" body="Zkuste jiné období, značku nebo měnu ve filtru nahoře." />;
  }

  const useNet = !filter.vatInclusive;
  const leaderRows: LeaderRow[] = [...byCity.entries()].map(([city, a]) => ({
    id: city,
    label: city,
    value: useNet ? a.net : a.gross,
    prev: a.hasPrev ? (useNet ? a.prevNet : a.prevGross) : null,
    receipts: a.receipts,
    atv: a.receipts > 0 ? a.gross / a.receipts : null,
  }));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
        Města ({leaderRows.length}) · {useNet ? "čisté tržby" : "tržby s DPH"} · {filter.currency}
      </h2>
      <PosLeaderboard rows={leaderRows} currency={filter.currency} valueLabel={useNet ? "Čisté tržby" : "Tržby"} />
      <p className="text-[11px] text-ink-soft">
        Město se bere z párování pokladen. Pobočky bez napárovaného města jsou v &quot;Neuvedeno&quot; - doplňte je v Administraci → Párování pokladen.
      </p>
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
