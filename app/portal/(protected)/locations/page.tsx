import {
  cachedListLocations,
  cachedGetLocationsSyncMeta,
} from "@/lib/portal/cached-db";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { LocationsPageClient } from "@/components/portal/locations/LocationsPageClient";

export const metadata = { title: "Lokality" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const [locations, syncMeta, session] = await Promise.all([
    cachedListLocations(),
    cachedGetLocationsSyncMeta(),
    getSession(),
  ]);

  const isAdmin = isAdminRole(session?.user?.role);

  return (
    <LocationsPageClient
      locations={locations}
      syncMeta={syncMeta}
      isAdmin={isAdmin}
    />
  );
}
