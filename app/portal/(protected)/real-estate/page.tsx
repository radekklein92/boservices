import {
  cachedListLocations,
  cachedListLocationLocalMap,
} from "@/lib/portal/cached-db";
import { effectiveReAgent } from "@/lib/portal/locations-db";
import { RealEstatePageClient } from "@/components/portal/locations/RealEstatePageClient";
import type { RealEstateRow } from "@/components/portal/locations/real-estate-shared";

export const metadata = { title: "Real Estate" };
export const dynamic = "force-dynamic";

export default async function RealEstatePage() {
  const [locations, localMap] = await Promise.all([
    cachedListLocations(),
    cachedListLocationLocalMap(),
  ]);

  // Sloučení do plain řádků — Map se neserializuje přes RSC boundary do klienta,
  // a effectiveReAgent počítáme na serveru (lokální volba má přednost).
  const rows: RealEstateRow[] = locations.map((l) => {
    const local = localMap.get(l.id) ?? null;
    return {
      id: l.id,
      name: l.name,
      code: l.code,
      hasNewco: Boolean(local?.newco),
      newco: local?.newco ?? null,
      note: local?.note ?? "",
      localReAgent: local?.reAgent ?? null,
      transitionReAgent: l.re_agent,
      effectiveReAgent: effectiveReAgent(l, local),
      leaseCurrent: l.lease_current_status,
      leaseTarget: l.lease_target_status,
    };
  });

  return <RealEstatePageClient rows={rows} />;
}
