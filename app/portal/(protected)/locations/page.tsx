import {
  cachedListLocations,
  cachedGetLocationsSyncMeta,
} from "@/lib/portal/cached-db";
import { listLocationIdsWithAttachments } from "@/lib/portal/locations-db";
import { LocationsPageClient } from "@/components/portal/locations/LocationsPageClient";

export const metadata = { title: "Lokality" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const [locations, syncMeta, withContractIds] = await Promise.all([
    cachedListLocations(),
    cachedGetLocationsSyncMeta(),
    // Nekešujeme - ať se filtr „nájemní smlouva" hned projeví po nahrání přílohy.
    listLocationIdsWithAttachments(),
  ]);

  return (
    <LocationsPageClient
      locations={locations}
      syncMeta={syncMeta}
      withContractIds={withContractIds}
    />
  );
}
