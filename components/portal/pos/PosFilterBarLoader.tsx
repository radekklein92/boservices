import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getAllShops } from "@/lib/portal/pos/queries";
import { buildPairingIndex } from "@/lib/portal/pos/pairing-db";
import { cachedListLocations } from "@/lib/portal/cached-db";
import { getViewsForUser } from "@/lib/portal/pos/views-db";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import {
  resolveSelection,
  selectionCurrencies,
  effectiveCurrency,
  POS_CURRENCIES,
} from "@/lib/portal/pos/selection";
import { isAllSelection, type PosFilter } from "@/lib/portal/pos/filters";
import { CONCEPT_LABEL } from "@/components/portal/locations/locations-shared";
import type { LocationConcept } from "@/lib/portal/locations-db";
import { PosFilterBar } from "./PosFilterBar";
import type { ConceptGroup, StoreOption, ViewLite } from "./pos-filter-shared";

// Pořadí konceptů ve filtru (zrcadlí LocationConcept enum).
const CONCEPT_ORDER: LocationConcept[] = [
  "TK", "KoP", "BB", "OXO", "RAK", "VD", "MFP", "KoFi", "Cinname", "Rio", "Pitstop", "other",
];

// Async server komponenta: postaví strom Koncept -> Prodejna z párování + lokalit,
// nenapárované pokladny, uložené pohledy a info o uživateli. Žije pod <Suspense>,
// takže shell paintne hned a filtr dostreamuje. Číselníky jsou cachované.
// Měny: z currency_code pokladen ve výběru spočítá dostupné měny + efektivní
// (zvýrazněnou), aby přepínač nenabízel měny, ve kterých výběr nemá data.
export async function PosFilterBarLoader({ filter }: { filter: PosFilter }) {
  const session = await getSession();
  const email = session?.user?.email ?? "";
  const me = { email, isAdmin: isAdminRole(session?.user?.role) };

  let concepts: ConceptGroup[] = [];
  let unpaired: StoreOption[] = [];
  let currencies: string[] = [...POS_CURRENCIES];
  let activeCurrency = filter.currency;
  let views = { own: [] as ViewLite[], shared: [] as ViewLite[], defaultId: null as string | null };

  if (isPosApiConfigured()) {
    try {
      const [shops, index, locations, viewsForUser] = await Promise.all([
        getAllShops(),
        buildPairingIndex(),
        cachedListLocations(),
        email ? getViewsForUser(email) : Promise.resolve({ own: [], shared: [], defaultId: null }),
      ]);

      const locById = new Map(locations.map((l) => [l.id, l]));
      const byConcept = new Map<LocationConcept, StoreOption[]>();
      for (const [locId] of index.shopsByLocation) {
        const loc = locById.get(locId);
        if (!loc) continue;
        const arr = byConcept.get(loc.concept) ?? [];
        arr.push({ id: locId, name: loc.name });
        byConcept.set(loc.concept, arr);
      }
      concepts = CONCEPT_ORDER.filter((c) => byConcept.has(c)).map((c) => ({
        concept: c,
        label: CONCEPT_LABEL[c],
        locations: (byConcept.get(c) ?? []).sort((a, b) => a.name.localeCompare(b.name, "cs")),
      }));

      const paired = new Set(index.locationByShop.keys());
      unpaired = shops
        .filter((s) => !paired.has(s.id))
        .map((s) => ({ id: `shop:${s.id}`, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "cs"));

      // Měny dle aktuálního výběru (currency_code pokladen). Pro "vše" zůstává
      // standardní trojice a zvolená měna (summary umí všechny měny + grácní
      // Notice) - drží to konzistenci s resolveDisplayCurrency. Pro konkrétní
      // výběr nabízíme jen měny, ve kterých má data, a zvýrazníme efektivní.
      if (isAllSelection(filter.selection)) {
        currencies = [...POS_CURRENCIES];
        activeCurrency = filter.currency;
      } else {
        const resolved = resolveSelection(filter.selection, index, shops);
        const sel = selectionCurrencies(resolved, shops);
        currencies = sel.length > 0 ? sel : [...POS_CURRENCIES];
        activeCurrency = effectiveCurrency(filter.currency, resolved, shops);
      }

      views = viewsForUser;
    } catch {
      concepts = [];
      unpaired = [];
      currencies = [...POS_CURRENCIES];
      activeCurrency = filter.currency;
    }
  }

  return (
    <PosFilterBar
      concepts={concepts}
      unpaired={unpaired}
      currencies={currencies}
      activeCurrency={activeCurrency}
      views={views}
      me={me}
    />
  );
}
