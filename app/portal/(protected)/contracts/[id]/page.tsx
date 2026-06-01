import { notFound } from "next/navigation";
import { getContract, upsertContract } from "@/lib/portal/contracts-db";
import {
  CLAIM_BUNDLE_SECTIONS,
  CONTRACT_TYPE_META,
  isBundleType,
} from "@/lib/portal/contract-types";
import {
  getOrSeedContractTemplate,
  isTemplateApproved,
} from "@/lib/portal/contract-templates-db";
import { getSession } from "@/lib/portal/get-session";
import { getTemplateApprovers } from "@/lib/portal/users-db";
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

  // Aktuální stav schválení šablony - pro červený badge "Šablona neschválená".
  // Bundle = aspoň jedna ze 3 sub-šablon je pending → unapproved.
  let templateApproved = true;
  if (isBundleType(contract.type)) {
    const sectionTemplates = await Promise.all(
      CLAIM_BUNDLE_SECTIONS.map((t) => getOrSeedContractTemplate(t)),
    );
    templateApproved = sectionTemplates.every(isTemplateApproved);
  } else {
    const tpl = await getOrSeedContractTemplate(contract.type, contract.variant);
    templateApproved = isTemplateApproved(tpl);
  }

  // Schvalovatelé šablon - smí schválit smlouvu ve stavu Ke schválení.
  const [session, approvers] = await Promise.all([
    getSession(),
    getTemplateApprovers(),
  ]);
  const approverEmails = approvers.map((a) => a.email);
  const isApprover = !!session?.user?.email
    && approverEmails.includes(session.user.email);

  return (
    <ContractDetailClient
      initial={contract}
      templateApproved={templateApproved}
      isApprover={isApprover}
      approverEmails={approverEmails}
    />
  );
}
