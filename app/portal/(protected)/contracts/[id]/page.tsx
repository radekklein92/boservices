import { notFound } from "next/navigation";
import {
  getContract,
  statusOrder,
  upsertContract,
} from "@/lib/portal/contracts-db";
import {
  CLAIM_BUNDLE_SECTIONS,
  CONTRACT_TYPE_META,
  isApprovalGated,
  isBundleType,
} from "@/lib/portal/contract-types";
import {
  getOrSeedContractTemplate,
  isTemplateApproved,
} from "@/lib/portal/contract-templates-db";
import { extractOdmenaAmount } from "@/lib/portal/contract-fees";
import { getLocation, toLocationSnapshot } from "@/lib/portal/locations-db";
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

  // NewCo údaje lokality (Entita CEIP #1, Operational type) + baseline odměny
  // ze šablony - pro panel „Lokalita a schválení" (jen typy posuzované podle
  // lokality). Franšíza řeší poplatek přes placeholder, baseline nepotřebuje.
  let locationNewco:
    | { inFile: boolean; entitaCeip1: string; operationalType: string }
    | null = null;
  let standardOperatingFee: string | null = null;
  if (isApprovalGated(contract.type)) {
    if (contract.locationId) {
      const loc = await getLocation(contract.locationId);

      // Dokud smlouva není schválená, drž snapshot lokality živý vůči Transition
      // - oprava dat v Transition + sync se tak promítne do vyhodnocení klíče.
      // Po schválení (schvaleno+) zůstává zmrazený (rozhodnutí je závazné).
      if (loc && statusOrder(contract.status) < statusOrder("schvaleno")) {
        const fresh = toLocationSnapshot(loc, new Date().toISOString());
        const prev = contract.locationSnapshot;
        const changed =
          !prev ||
          prev.name !== fresh.name ||
          prev.category !== fresh.category ||
          prev.leaseStatus !== fresh.leaseStatus ||
          prev.newMode !== fresh.newMode;
        if (changed) {
          contract = { ...contract, locationSnapshot: fresh };
          await upsertContract(contract);
        }
      }

      const nc = loc?.local?.newco;
      locationNewco = {
        inFile: !!nc,
        entitaCeip1: nc?.entitaCeip1 ?? "",
        operationalType: nc?.operationalType ?? "",
      };
    }
    if (contract.type === "cooperation" || contract.type === "operation") {
      const tpl = await getOrSeedContractTemplate(contract.type, contract.variant);
      standardOperatingFee = extractOdmenaAmount(tpl.html);
    }
  }

  // Schvalovatelé šablon - smí schválit smlouvu ve stavu Ke schválení.
  const [session, approvers] = await Promise.all([
    getSession(),
    getTemplateApprovers(),
  ]);
  const approverEmails = approvers.map((a) => a.email);
  const isApprover = !!session?.user?.email
    && approverEmails.includes(session.user.email);
  const isSuperadmin = session?.user?.role === "superadmin";

  return (
    <ContractDetailClient
      initial={contract}
      templateApproved={templateApproved}
      isApprover={isApprover}
      isSuperadmin={isSuperadmin}
      approverEmails={approverEmails}
      locationNewco={locationNewco}
      standardOperatingFee={standardOperatingFee}
    />
  );
}
