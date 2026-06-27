import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { posFilterFromSearchParams, serializePosFilter } from "@/lib/portal/pos/filters";
import { getAllShops, getBrands, getShopLeaderboardFull } from "@/lib/portal/pos/queries";
import { buildPairingIndex } from "@/lib/portal/pos/pairing-db";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { PosLeaderboard, type LeaderRow } from "@/components/portal/pos/PosLeaderboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokladna - Provozovny" };

export default async function PosShopsPage({
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

  let rows: Awaited<ReturnType<typeof getShopLeaderboardFull>>;
  let shopsRaw: Awaited<ReturnType<typeof getAllShops>>;
  let brandsRaw: Awaited<ReturnType<typeof getBrands>>;
  let pairing: Awaited<ReturnType<typeof buildPairingIndex>>;
  try {
    [rows, shopsRaw, brandsRaw, pairing] = await Promise.all([
      getShopLeaderboardFull(filter),
      getAllShops(),
      getBrands(),
      buildPairingIndex(),
    ]);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst leaderboard z API Data Warehouse." />;
  }

  if (rows.length === 0) {
    return <Notice title="Pro zvolené období nejsou data" body="Zkuste jiné období, značku nebo měnu ve filtru nahoře." />;
  }

  const shopName = new Map(shopsRaw.map((s) => [s.id, s.name]));
  const brandName = new Map(brandsRaw.map((b) => [b.id, b.name]));
  const useNet = !filter.vatInclusive;

  const filterQs = serializePosFilter(filter).toString();
  const leaderRows: LeaderRow[] = rows
    .filter((r) => shopName.has(r.shop_id))
    .map((r) => {
      const city = pairing.cityByShop.get(r.shop_id);
      const sub = [brandName.get(r.brand_id) ?? "", city ?? ""].filter(Boolean).join(" · ");
      return {
        id: r.shop_id,
        label: shopName.get(r.shop_id) as string,
        sublabel: sub || undefined,
        href: `/portal/pos/provozovny/${r.shop_id}${filterQs ? `?${filterQs}` : ""}`,
        value: useNet ? r.net : r.gross,
        prev: useNet ? r.prevNet : r.prevGross,
        receipts: r.receipts,
        atv: r.receipts > 0 ? r.gross / r.receipts : null,
      };
    });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
        Provozovny ({leaderRows.length}) · {useNet ? "čisté tržby" : "tržby s DPH"} · {filter.currency}
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
