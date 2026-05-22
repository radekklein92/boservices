import { notFound } from "next/navigation";
import { upsertContract } from "@/lib/portal/contracts-db";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
import {
  cachedGetContract,
  cachedGetOrSeedContractTemplate,
} from "@/lib/portal/cached-db";
import { bustContracts } from "@/lib/portal/revalidate";
import { ContractDetailClient } from "@/components/portal/contracts/ContractDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contract = await cachedGetContract(id);
  if (!contract) return { title: "Smlouva" };
  return {
    title: `${CONTRACT_TYPE_META[contract.type].shortName} - ${contract.clientName}`,
  };
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let contract = await cachedGetContract(id);
  if (!contract) notFound();

  // Self-healing: smlouvy vytvořené před F9 nemají templateSnapshot.
  // Doplníme jej z aktuální šablony, aby diff fungoval i pro staré smlouvy.
  if (!contract.templateSnapshot) {
    const template = await cachedGetOrSeedContractTemplate(contract.type);
    contract = { ...contract, templateSnapshot: template.html };
    await upsertContract(contract);
    bustContracts();
  }

  return <ContractDetailClient initial={contract} />;
}
