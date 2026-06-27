import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal/get-session";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { getAllShops, getBrands } from "@/lib/portal/pos/queries";
import { PosFilterBar } from "@/components/portal/pos/PosFilterBar";
import { PosTabs } from "@/components/portal/pos/PosTabs";
import { PosSyncBadge } from "@/components/portal/pos/PosSyncBadge";

// POS / pokladní sekce vidí manager + admin + superadmin. Náhled role ("view as")
// se promítá - getSession vrací efektivní roli. Hlavička + taby + filtr žijí
// v layoutu -> persistují napříč POS obrazovkami.
export const dynamic = "force-dynamic";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) redirect("/portal");

  let brands: { id: string; name: string }[] = [];
  let shops: { id: string; name: string; brandId: string }[] = [];
  if (isPosApiConfigured()) {
    try {
      const [b, s] = await Promise.all([getBrands(), getAllShops()]);
      brands = b.map((x) => ({ id: x.id, name: x.name }));
      shops = s.map((x) => ({ id: x.id, name: x.name, brandId: x.brand_id }));
    } catch {
      brands = [];
      shops = [];
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink-base">
          Tržby
        </h1>
        <PosSyncBadge />
      </div>
      <PosTabs />
      <PosFilterBar brands={brands} shops={shops} currencies={["CZK", "EUR", "PLN"]} />
      {children}
    </div>
  );
}
