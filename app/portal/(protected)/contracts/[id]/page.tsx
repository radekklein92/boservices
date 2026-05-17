import { notFound } from "next/navigation";
import { getContract } from "@/lib/portal/contracts-db";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
import { ContractDetailClient } from "@/components/portal/contracts/ContractDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contract = await getContract(id);
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
  const contract = await getContract(id);
  if (!contract) notFound();

  return <ContractDetailClient initial={contract} />;
}
