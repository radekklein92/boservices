import { Suspense } from "react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { posFilterFromSearchParams, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import { getTopProducts } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { PosSubNav } from "@/components/portal/pos/PosSubNav";
import { PosFilterBarLoader } from "@/components/portal/pos/PosFilterBarLoader";
import { PosProductsTable, type ProductRow } from "@/components/portal/pos/PosProductsTable";
import { FilterBarSkeleton, LeaderboardSkeleton } from "@/components/portal/pos/skeletons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tržby - Produkty" };

export default async function PosProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const filter = posFilterFromSearchParams(await searchParams);
  const backQs = serializePosFilter(filter).toString();
  return (
    <>
      <PageHeader
        eyebrow="Provoz"
        title="Produkty"
        lede="Nejprodávanější položky v rámci výběru a období."
      />
      <PosSubNav />

      <Suspense fallback={<FilterBarSkeleton />}>
        <PosFilterBarLoader filter={filter} />
      </Suspense>
      {!isPosApiConfigured() ? (
        <Notice title="POS data nejsou nakonfigurovaná" body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel)." />
      ) : (
        <Suspense fallback={<LeaderboardSkeleton rows={10} />}>
          <ProductsTable filter={filter} />
        </Suspense>
      )}
    </>
  );
}

async function ProductsTable({ filter }: { filter: PosFilter }) {
  const useNet = !filter.vatInclusive;

  let rows: Awaited<ReturnType<typeof getTopProducts>>;
  try {
    rows = await getTopProducts(filter, "gross", 50);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst produkty z API Data Warehouse." />;
  }

  if (rows.length === 0) {
    return <Notice title="Pro zvolené období nejsou produkty" body="Zkuste jiné období, značku nebo měnu ve filtru nahoře." />;
  }

  // Měna z dat (efektivní měna výběru, viz queries.ts), ne čistě z filtru.
  const cur = rows[0]?.currency ?? filter.currency;
  const maxGross = Math.max(...rows.map((r) => r.gross), 1);
  const qs = serializePosFilter(filter).toString();
  const tableRows: ProductRow[] = rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    href: `/portal/pos/produkty/${encodeURIComponent(r.product_id)}${qs ? `?${qs}` : ""}`,
    qty: r.qty,
    value: useNet ? r.net : r.gross,
    unit: useNet ? r.avg_unit_price_net : r.avg_unit_price,
    bar: r.gross / maxGross,
  }));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
        Top produkty dle tržeb ({useNet ? "čisté" : "s DPH"}, {cur})
      </h2>
      <PosProductsTable rows={tableRows} currency={cur} />
      <p className="text-[11px] text-ink-soft">
        Kategorie zatím API nevystavuje; rozpad podle kategorií přibude rozšířením DW. Top 50 produktů. Klik na produkt = detail (kde se prodává).
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
