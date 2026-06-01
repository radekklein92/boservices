import { PageHeader } from "@/components/portal/shell/PageHeader";
import { ContractsList } from "@/components/portal/contracts/ContractsList";
import {
  cachedListClients,
  cachedListContracts,
} from "@/lib/portal/cached-db";
import { getSession } from "@/lib/portal/get-session";
import { getTemplateApprovers } from "@/lib/portal/users-db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Smlouvy" };

export default async function ContractsPage() {
  const [contracts, clients, session, approvers] = await Promise.all([
    cachedListContracts(),
    cachedListClients(),
    getSession(),
    getTemplateApprovers(),
  ]);

  const isApprover =
    !!session?.user?.email &&
    approvers.some((a) => a.email === session.user!.email);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Smlouvy"
        title="Smlouvy"
        lede="Vygenerujte smlouvu pro klienta, stáhněte PDF a po podpisu nahrajte naskenovanou kopii."
      />
      <ContractsList contracts={contracts} clients={clients} isApprover={isApprover} />
    </div>
  );
}
