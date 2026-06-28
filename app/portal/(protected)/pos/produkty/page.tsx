import { Suspense } from "react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { posFilterFromSearchParams, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import { getTopProducts } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { PosSubNav } from "@/components/portal/pos/PosSubNav";
import { PosFilterBarLoader } from "@/components/portal/pos/PosFilterBarLoader";
import { formatPosMoney, formatPosNumber } from "@/components/portal/pos/pos-shared";
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
      <Suspense fallback={<FilterBarSkeleton />}>
        <PosFilterBarLoader />
      </Suspense>

      <PosSubNav />
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
  const cur = filter.currency;
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

  const maxGross = Math.max(...rows.map((r) => r.gross), 1);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
        Top produkty dle tržeb ({useNet ? "čisté" : "s DPH"}, {cur})
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-edge bg-paper">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-edge text-left text-[11px] uppercase tracking-[0.1em] text-ink-mid">
              <th className="px-4 py-3 font-medium">Produkt</th>
              <th className="px-4 py-3 text-right font-medium">Množství</th>
              <th className="px-4 py-3 text-right font-medium">Tržby</th>
              <th className="px-4 py-3 text-right font-medium">Ø cena</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gross = useNet ? r.net : r.gross;
              const unit = useNet ? r.avg_unit_price_net : r.avg_unit_price;
              return (
                <tr key={r.product_id} className="border-b border-edge/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-ink-base">{r.name || "—"}</span>
                      <span className="h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-edge">
                        <span
                          className="block h-full rounded-full bg-ink-base"
                          style={{ width: `${Math.max(2, (r.gross / maxGross) * 100)}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-deep">
                    {formatPosNumber(r.qty, 0)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-base">
                    {formatPosMoney(gross, cur)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-mid">
                    {unit != null ? formatPosMoney(unit, cur) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-soft">
        Kategorie zatím API nevystavuje; rozpad podle kategorií přibude rozšířením DW. Top 50 produktů.
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
