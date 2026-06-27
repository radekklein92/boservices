import { PageHeader } from "@/components/portal/shell/PageHeader";
import { ContractsList } from "@/components/portal/contracts/ContractsList";
import {
  cachedListClients,
  cachedListContracts,
} from "@/lib/portal/cached-db";
import { getSession } from "@/lib/portal/get-session";
import { getTemplateApprovers, listUsers } from "@/lib/portal/users-db";
import {
  ALL_CONTRACT_STATUSES,
  type ContractStatus,
} from "@/lib/portal/contracts-db";
import { CONTRACT_TYPES, type ContractType } from "@/lib/portal/contract-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Smlouvy" };

export default async function ContractsPage({
  searchParams,
}: {
  // Předfiltr z URL (proklik z dashboardu): ?type=franchise&status=podepsano-klientem,archivovano
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const [contracts, clients, session, approvers, users, sp] = await Promise.all([
    cachedListContracts(),
    cachedListClients(),
    getSession(),
    getTemplateApprovers(),
    listUsers(),
    searchParams,
  ]);

  const isApprover =
    !!session?.user?.email &&
    approvers.some((a) => a.email === session.user!.email);
  const currentUserEmail = session?.user?.email ?? "";
  const isSuperadmin = session?.user?.role === "superadmin";
  const userOptions = users.map((u) => ({ email: u.email, name: u.name }));

  // Validace předfiltru z URL (neznámé hodnoty ignorujeme).
  const initialType = (CONTRACT_TYPES as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as ContractType)
    : undefined;
  const validStatuses = new Set<string>(ALL_CONTRACT_STATUSES);
  const initialStatuses = (sp.status?.split(",") ?? [])
    .map((s) => s.trim())
    .filter((s) => validStatuses.has(s)) as ContractStatus[];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Franšízing"
        title="Smlouvy"
        lede="Vygenerujte smlouvu pro klienta, stáhněte PDF a po podpisu nahrajte naskenovanou kopii."
      />
      <ContractsList
        contracts={contracts}
        clients={clients}
        isApprover={isApprover}
        currentUserEmail={currentUserEmail}
        isSuperadmin={isSuperadmin}
        userOptions={userOptions}
        initialType={initialType}
        initialStatuses={initialStatuses}
      />
    </div>
  );
}
