import { cachedListLocationFranchiseContracts, cachedListReFlags } from "@/lib/portal/cached-db";
import { listLocations, listLocationLocalMap } from "@/lib/portal/locations-db";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { RealEstatePageClient } from "@/components/portal/locations/RealEstatePageClient";
import type { RealEstateRow } from "@/components/portal/locations/real-estate-shared";

export const metadata = { title: "Real Estate" };
export const dynamic = "force-dynamic";

export default async function RealEstatePage() {
  // Lokality + lokální data čteme PŘÍMO (bez unstable_cache): je to živá
  // editovatelná tabulka a 1h TTL by držela zastaralý stav po změnách mimo UI
  // (seed skript, hodinový sync, write-through agenta/nájmu). Stránka je stejně
  // force-dynamic a Redis je kolokovaný ve fra1 → dva pipeline scany jsou pár ms.
  // Franšízingové smlouvy a katalog flagů ale zůstávají cachované: mění se jen
  // přes UI (→ bustContracts/bustReFlags hned invaliduje), TTL tu nevadí.
  const [locations, localMap, franchiseByLocation, flags, session] =
    await Promise.all([
      listLocations(),
      listLocationLocalMap(),
      // locationId -> id podepsané franšízingové smlouvy (badge „franšíza").
      cachedListLocationFranchiseContracts(),
      // Sdílený katalog uživatelských flagů (definice label+barva).
      cachedListReFlags(),
      getSession(),
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
      reAgent: l.re_agent,
      locationStatus: l.location_status,
      category: l.category,
      flagIds: local?.flagIds ?? [],
      solveDespiteRed: local?.solveDespiteRed ?? false,
      manualRed: local?.manualRed ?? null,
      leaseCurrent: l.lease_current_status,
      leaseTarget: l.lease_target_status,
      franchiseContractId: franchiseByLocation[l.id] ?? null,
      reCheckIn: local?.reCheckIn ?? null,
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
