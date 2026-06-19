import {
  cachedListLocations,
  cachedGetLocationsSyncMeta,
  cachedListLocationIdsWithAttachments,
  cachedListLocationFranchiseContracts,
} from "@/lib/portal/cached-db";
import { LocationsPageClient } from "@/components/portal/locations/LocationsPageClient";

export const metadata = { title: "Lokality" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const [locations, syncMeta, withContractIds, franchiseByLocation] =
    await Promise.all([
      cachedListLocations(),
      cachedGetLocationsSyncMeta(),
      // Cachované (unstable_cache) - invalidace přes bustLocations při nahrání/
      // smazání přílohy, takže filtr „nájemní smlouva" se projeví okamžitě.
      cachedListLocationIdsWithAttachments(),
      // Invalidace přes bustContracts/bustLocations - badge „franšíza" hned po podpisu.
      cachedListLocationFranchiseContracts(),
    ]);

  return (
    <LocationsPageClient
      locations={locations}
      syncMeta={syncMeta}
      withContractIds={withContractIds}
      franchiseByLocation={franchiseByLocation}
    />
  );
}
