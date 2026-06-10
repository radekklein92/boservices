import {
  cachedListLocations,
  cachedGetLocationsSyncMeta,
} from "@/lib/portal/cached-db";
import { listLocationIdsWithAttachments } from "@/lib/portal/locations-db";
import { listLocationFranchiseContracts } from "@/lib/portal/contracts-db";
import { LocationsPageClient } from "@/components/portal/locations/LocationsPageClient";

export const metadata = { title: "Lokality" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const [locations, syncMeta, withContractIds, franchiseByLocation] =
    await Promise.all([
      cachedListLocations(),
      cachedGetLocationsSyncMeta(),
      // Nekešujeme - ať se filtr „nájemní smlouva" hned projeví po nahrání přílohy.
      listLocationIdsWithAttachments(),
      // Nekešujeme - ať se badge „franšíza" projeví hned po podpisu.
      listLocationFranchiseContracts(),
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
