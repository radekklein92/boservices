import {
  cachedListClients,
  cachedListContracts,
} from "@/lib/portal/cached-db";
import {
  clientContractBadges,
  type ClientContractBadge,
  type ContractLite,
} from "@/lib/portal/client-contract-status";
import { ClientsPageClient } from "@/components/portal/clients/ClientsPageClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Klienti" };

export default async function ClientsPage() {
  const [clients, contracts] = await Promise.all([
    cachedListClients(),
    cachedListContracts(),
  ]);

  // Smlouvy seskupíme podle klienta a z nich + plánu spočítáme stav ikonek.
  const byClient = new Map<string, ContractLite[]>();
  for (const c of contracts) {
    const arr = byClient.get(c.clientId) ?? [];
    arr.push({
      type: c.type,
      clientSignedAt: c.clientSignedAt,
      scanUploadedAt: c.scanUploadedAt,
    });
    byClient.set(c.clientId, arr);
  }

  const badgesByClient: Record<string, ClientContractBadge[]> = {};
  for (const cl of clients) {
    badgesByClient[cl.id] = clientContractBadges(
      cl.plannedContracts,
      byClient.get(cl.id) ?? [],
    );
  }

  return <ClientsPageClient initial={clients} badgesByClient={badgesByClient} />;
}
