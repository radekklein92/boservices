import {
  cachedListLocations,
  cachedListLocationLocalMap,
  cachedListLocationFranchiseContracts,
  cachedListReFlags,
} from "@/lib/portal/cached-db";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { RealEstatePageClient } from "@/components/portal/locations/RealEstatePageClient";
import type { RealEstateRow } from "@/components/portal/locations/real-estate-shared";

export const metadata = { title: "Real Estate" };
export const dynamic = "force-dynamic";

export default async function RealEstatePage() {
  const [locations, localMap, franchiseByLocation, flags, session] =
    await Promise.all([
      cachedListLocations(),
      cachedListLocationLocalMap(),
      // locationId -> id podepsané franšízingové smlouvy (badge „franšíza").
      cachedListLocationFranchiseContracts(),
      // Sdílený katalog uživatelských flagů (definice label+barva).
      cachedListReFlags(),
      auth(),
    ]);

  // Sloučení do plain řádků — Map se neserializuje přes RSC boundary do klienta.
  // re_agent + lease statusy jsou z Transition (editují se write-through zpět).
  const rows: RealEstateRow[] = locations.map((l) => {
    const local = localMap.get(l.id) ?? null;
    return {
      id: l.id,
      name: l.name,
      code: l.code,
      hasNewco: Boolean(local?.newco),
      newco: local?.newco ?? null,
      note: local?.note ?? "",
      reNote: local?.reNote ?? "",
      reAgent: l.re_agent,
      flagIds: local?.flagIds ?? [],
      leaseCurrent: l.lease_current_status,
      leaseTarget: l.lease_target_status,
      franchiseContractId: franchiseByLocation[l.id] ?? null,
    };
  });

  return (
    <RealEstatePageClient
      rows={rows}
      flags={flags}
      currentUserEmail={session?.user?.email ?? ""}
      isAdmin={isAdminRole(session?.user?.role)}
    />
  );
}
