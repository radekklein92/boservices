import { notFound } from "next/navigation";
import { getContract, upsertContract } from "@/lib/portal/contracts-db";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
import { getOrSeedContractTemplate } from "@/lib/portal/contract-templates-db";
import { ContractDetailClient } from "@/components/portal/contracts/ContractDetailClient";

export const dynamic = "force-dynamic";

// Detail smlouvy NEcachujeme přes unstable_cache - obsah se mění často
// (editace, status, signer...) a hlavně tady děláme self-heal upsert, který
// by způsobil nekonzistenci mezi cachovaným read a čerstvým write. List
// stránka (/portal/contracts) cache používá - ta má největší benefit.
//
// Pozn.: revalidateTag(...) nelze volat z page render (jen ze server actions
// / route handlerů), takže bustContracts() tady nemá co dělat.

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
  let contract = await getContract(id);
  if (!contract) notFound();

  // Self-healing: smlouvy vytvořené před F9 nemají templateSnapshot.
  // Doplníme jej z aktuální šablony, aby diff fungoval i pro staré smlouvy.
  if (!contract.templateSnapshot) {
    const template = await getOrSeedContractTemplate(contract.type);
    contract = { ...contract, templateSnapshot: template.html };
    await upsertContract(contract);
  }

  return <ContractDetailClient initial={contract} />;
}
