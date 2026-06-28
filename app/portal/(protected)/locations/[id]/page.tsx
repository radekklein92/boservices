import { notFound } from "next/navigation";
import {
  cachedGetLocation,
  cachedListContracts,
  cachedListReFlags,
} from "@/lib/portal/cached-db";
import { contractDisplayStatus, statusOrder } from "@/lib/portal/contracts-db";
import {
  LocationDetail,
  type LocationContractRow,
} from "@/components/portal/locations/LocationDetail";
import { EntityTasks } from "@/components/portal/tasks/EntityTasks";
import { PosLocationPanel } from "@/components/portal/pos/PosLocationPanel";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const location = await cachedGetLocation(id);
  return { title: location ? location.name : "Lokalita" };
}

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [location, allContracts, flagCatalog] = await Promise.all([
    cachedGetLocation(id),
    cachedListContracts(),
    cachedListReFlags(),
  ]);
  if (!location) notFound();

  // Přiřazené flagy z RE tabulky (LocationLocal.flagIds) přeložené přes katalog.
  // Pořadí katalogu (stabilní), jen flagy, které pořád existují.
  const assigned = new Set(location.local?.flagIds ?? []);
  const flags = flagCatalog.filter((f) => assigned.has(f.id));

  // Smlouvy navázané na tuto lokalitu (franšíza / spolupráce / provozování mají
  // povinný locationId). Plné objekty Contract jsou těžké (HTML, claims…) — přes
  // RSC boundary do klienta posíláme jen lehký řádek. Pořadí: aktivní podle
  // pokročilosti stavu (nejdál v podpisovém flow nahoře), zrušené na konci.
  const contracts: LocationContractRow[] = allContracts
    .filter((c) => c.locationId === id)
    .map((c) => ({
      id: c.id,
      type: c.type,
      // Zobrazovaný stav (u DigiSign mezistavu „Podepsáno klientem") - konzistentně
      // s osou na detailu, seznamem i řazením („nejdál ve flow nahoře").
      status: contractDisplayStatus(c),
      clientName: c.clientName,
      number: c.number ?? null,
      cancelled: Boolean(c.cancelledAt),
      createdAt: c.createdAt,
    }))
    .sort((a, b) => {
      if (a.cancelled !== b.cancelled) return a.cancelled ? 1 : -1;
      const so = statusOrder(b.status) - statusOrder(a.status);
      if (so !== 0) return so;
      return b.createdAt.localeCompare(a.createdAt);
    });

  return (
    <div className="flex flex-col gap-10">
      <LocationDetail
        location={location}
        contracts={contracts}
        flags={flags}
        posPanel={<PosLocationPanel locationId={id} />}
      />
      <EntityTasks kind="location" id={id} />
    </div>
  );
}
