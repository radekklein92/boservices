import { PageHeader } from "@/components/portal/shell/PageHeader";
import { ContractsList } from "@/components/portal/contracts/ContractsList";
import {
  cachedListClients,
  cachedListContracts,
} from "@/lib/portal/cached-db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Smlouvy" };

export default async function ContractsPage() {
  const [contracts, clients] = await Promise.all([
    cachedListContracts(),
    cachedListClients(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Smlouvy"
        title="Smlouvy"
        lede="Vygenerujte smlouvu pro klienta, stáhněte PDF a po podpisu nahrajte naskenovanou kopii."
      />
      <ContractsList contracts={contracts} clients={clients} />
    </div>
  );
}
