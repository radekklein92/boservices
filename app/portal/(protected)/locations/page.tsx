import {
  cachedListLocations,
  cachedGetLocationsSyncMeta,
  cachedListLocationIdsWithAttachments,
  cachedListLocationFranchiseContracts,
  cachedListLocationLocalMap,
} from "@/lib/portal/cached-db";
import { isBosStore } from "@/components/portal/locations/real-estate-shared";
import { LocationsPageClient } from "@/components/portal/locations/LocationsPageClient";

export const metadata = { title: "Lokality" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const [locations, syncMeta, withContractIds, franchiseByLocation, localMap] =
    await Promise.all([
      cachedListLocations(),
      cachedGetLocationsSyncMeta(),
      // Cachované (unstable_cache) - invalidace přes bustLocations při nahrání/
      // smazání přílohy, takže filtr „nájemní smlouva" se projeví okamžitě.
      cachedListLocationIdsWithAttachments(),
      // Invalidace přes bustContracts/bustLocations - badge „franšíza" hned po podpisu.
      cachedListLocationFranchiseContracts(),
      // Lokální data (newco/manualRed/solveDespiteRed) - vstup pro „BOS prodejna".
      cachedListLocationLocalMap(),
    ]);

  // „BOS prodejna" (sdílený predikát isBosStore): počítá se server-side ze stejných
  // zdrojů jako v Real Estate tabulce; do klienta jde jen serializovatelný seznam id.
  const bosLocationIds = locations
    .filter((l) => {
      const local = localMap.get(l.id);
      return isBosStore({
        franchiseContractId: franchiseByLocation[l.id] ?? null,
        hasNewco: Boolean(local?.newco),
        newco: local?.newco ?? null,
        manualRed: local?.manualRed ?? null,
        solveDespiteRed: local?.solveDespiteRed ?? false,
      });
    })
    .map((l) => l.id);

  return (
    <LocationsPageClient
      locations={locations}
      syncMeta={syncMeta}
      withContractIds={withContractIds}
      franchiseByLocation={franchiseByLocation}
      bosLocationIds={bosLocationIds}
    />
  );
}
