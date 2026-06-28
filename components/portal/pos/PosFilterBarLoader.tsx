import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getAllShops, bosLocationIdSet } from "@/lib/portal/pos/queries";
import { buildPairingIndex } from "@/lib/portal/pos/pairing-db";
import { cachedListLocations } from "@/lib/portal/cached-db";
import { getViewsForUser } from "@/lib/portal/pos/views-db";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { POS_CURRENCIES } from "@/lib/portal/pos/selection";
import type { PosFilter } from "@/lib/portal/pos/filters";
import { CONCEPT_LABEL } from "@/components/portal/locations/locations-shared";
import type { LocationConcept } from "@/lib/portal/locations-db";
import { PosFilterBar } from "./PosFilterBar";
import type { CityGroup, ConceptGroup, StoreOption, ViewLite } from "./pos-filter-shared";

// Pořadí konceptů ve filtru (zrcadlí LocationConcept enum).
const CONCEPT_ORDER: LocationConcept[] = [
  "TK", "KoP", "BB", "OXO", "RAK", "VD", "MFP", "KoFi", "Cinname", "Rio", "Pitstop", "other",
];

// Async server komponenta: postaví strom Koncept -> Prodejna z párování + lokalit,
// nenapárované pokladny, uložené pohledy a info o uživateli. Žije pod <Suspense>,
// takže shell paintne hned a filtr dostreamuje. Číselníky jsou cachované.
// Měny: z currency_code pokladen ve výběru spočítá dostupné měny + efektivní
// (zvýrazněnou), aby přepínač nenabízel měny, ve kterých výběr nemá data.
export async function PosFilterBarLoader({
  filter,
  hidePeriod = false,
}: {
  filter: PosFilter;
  hidePeriod?: boolean;
}) {
  const session = await getSession();
  const email = session?.user?.email ?? "";
  const me = { email, isAdmin: isAdminRole(session?.user?.role) };

  let concepts: ConceptGroup[] = [];
  let unpaired: StoreOption[] = [];
  // Zobrazovací měny v dropdownu jsou vždy plná trojice - vše se do zvolené
  // přepočítá přes FX (fx.ts), takže nabídku neořezáváme dle měn ve výběru.
  const currencies: string[] = [...POS_CURRENCIES];
  let views = { own: [] as ViewLite[], shared: [] as ViewLite[], defaultId: null as string | null };

  if (isPosApiConfigured()) {
    try {
      // Okruh "bos": picker nabízí jen BOS prodejny (sdílený bosLocationIdSet -
      // stejná množina jako agregace). Počty i města tím reflektují BOS.
      const bosOnly = filter.scope === "bos";
      const [shops, index, locations, viewsForUser, bosLoc] = await Promise.all([
        getAllShops(),
        buildPairingIndex(),
        cachedListLocations(),
        email ? getViewsForUser(email) : Promise.resolve({ own: [], shared: [], defaultId: null }),
        bosOnly ? bosLocationIdSet() : Promise.resolve(new Set<string>()),
      ]);

      const locById = new Map(locations.map((l) => [l.id, l]));

      // Město prodejny = město její první pokladny (pro vnoření Koncept -> Město).
      const cityByLocation = new Map<string, string>();
      for (const [locId, shopIds] of index.shopsByLocation) {
        if (!locById.has(locId)) continue;
        for (const sid of shopIds) {
          const c = index.cityByShop.get(sid);
          if (c) {
            cityByLocation.set(locId, c);
            break;
          }
        }
      }

      const byConcept = new Map<LocationConcept, StoreOption[]>();
      for (const [locId] of index.shopsByLocation) {
        const loc = locById.get(locId);
        if (!loc) continue;
        if (bosOnly && !bosLoc.has(locId)) continue;
        const arr = byConcept.get(loc.concept) ?? [];
        arr.push({ id: locId, name: loc.name });
        byConcept.set(loc.concept, arr);
      }
      concepts = CONCEPT_ORDER.filter((c) => byConcept.has(c)).map((c) => {
        const locs = (byConcept.get(c) ?? []).sort((a, b) => a.name.localeCompare(b.name, "cs"));
        // seskup prodejny konceptu po městech; bez města -> skupina city "" (Ostatní)
        const byCity = new Map<string, StoreOption[]>();
        for (const loc of locs) {
          const city = cityByLocation.get(loc.id) ?? "";
          const arr = byCity.get(city) ?? [];
          arr.push(loc);
          byCity.set(city, arr);
        }
        const cities: CityGroup[] = [...byCity.entries()]
          .map(([city, cityLocs]) => ({ city, locations: cityLocs }))
          .sort((a, b) => (!a.city ? 1 : !b.city ? -1 : a.city.localeCompare(b.city, "cs")));
        return { concept: c, label: CONCEPT_LABEL[c], locations: locs, cities };
      });

      const paired = new Set(index.locationByShop.keys());
      unpaired = shops
        .filter((s) => !paired.has(s.id))
        .map((s) => ({ id: `shop:${s.id}`, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "cs"));

      views = viewsForUser;
    } catch {
      concepts = [];
      unpaired = [];
    }
  }

  return (
    <PosFilterBar
      concepts={concepts}
      unpaired={unpaired}
      currencies={currencies}
      views={views}
      me={me}
      hidePeriod={hidePeriod}
    />
  );
}
