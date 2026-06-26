import { cachedListLocationFranchiseContracts } from "@/lib/portal/cached-db";
import { listLocations, listLocationLocalMap } from "@/lib/portal/locations-db";
import { RealEstatePageClient } from "@/components/portal/locations/RealEstatePageClient";
import type { RealEstateRow } from "@/components/portal/locations/real-estate-shared";

export const metadata = { title: "Real Estate" };
export const dynamic = "force-dynamic";

export default async function RealEstatePage() {
  // Lokality + lokální data čteme PŘÍMO (bez unstable_cache): je to živá
  // editovatelná tabulka a 1h TTL by držela zastaralý stav po změnách mimo UI
  // (seed skript, hodinový sync, write-through agenta/nájmu). Stránka je stejně
  // force-dynamic a Redis je kolokovaný ve fra1 → dva pipeline scany jsou pár ms.
  // Franšízingové smlouvy ale zůstávají cachované: drahý scan, mění se jen
  // podpisem (přes UI → bustContracts hned invaliduje), TTL tu nevadí.
  const [locations, localMap, franchiseByLocation] = await Promise.all([
    listLocations(),
    listLocationLocalMap(),
    // locationId -> id podepsané franšízingové smlouvy (badge „franšíza").
    cachedListLocationFranchiseContracts(),
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
      leaseCurrent: l.lease_current_status,
      leaseTarget: l.lease_target_status,
      franchiseContractId: franchiseByLocation[l.id] ?? null,
    };
  });

  return <RealEstatePageClient rows={rows} />;
}
