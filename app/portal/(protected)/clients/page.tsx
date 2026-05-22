import { cachedListClients } from "@/lib/portal/cached-db";
import { ClientsPageClient } from "@/components/portal/clients/ClientsPageClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Klienti" };

export default async function ClientsPage() {
  const clients = await cachedListClients();
  return <ClientsPageClient initial={clients} />;
}
