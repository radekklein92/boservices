import { getAllShops, getBrands } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { PosFilterBar } from "./PosFilterBar";

// Async server komponenta: načte značky + pobočky pro filtr. Žije pod <Suspense>
// v layoutu, takže shell (hlavička/taby) paintne hned a filtr dostreamuje.
// Číselníky jsou cachované na dlouhý TTL (posStaticQuery), takže běžně cache hit.
export async function PosFilterBarLoader() {
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
  return <PosFilterBar brands={brands} shops={shops} currencies={["CZK", "EUR", "PLN"]} />;
}
