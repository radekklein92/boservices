import { listClients } from "@/lib/portal/clients-db";
import { ClientsPageClient } from "@/components/portal/clients/ClientsPageClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Klienti" };

export default async function ClientsPage() {
  const clients = await listClients();
  return <ClientsPageClient initial={clients} />;
}
