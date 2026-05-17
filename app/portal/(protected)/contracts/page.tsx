import { PageHeader } from "@/components/portal/shell/PageHeader";
import { ContractsList } from "@/components/portal/contracts/ContractsList";
import { listContracts } from "@/lib/portal/contracts-db";
import { listClients } from "@/lib/portal/clients-db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Smlouvy" };

export default async function ContractsPage() {
  const [contracts, clients] = await Promise.all([listContracts(), listClients()]);

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
