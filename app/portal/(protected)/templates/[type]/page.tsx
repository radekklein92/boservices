import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/portal/auth-guard";
import {
  isContractType,
  hasVariants,
  isBundleType,
  isValidVariantForType,
  getDefaultVariantForType,
  CONTRACT_TYPE_META,
  type ContractVariant,
} from "@/lib/portal/contract-types";
import { getOrSeedContractTemplate } from "@/lib/portal/contract-templates-db";
import { TemplateEditorClient } from "@/components/portal/contracts/TemplateEditorClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!isContractType(type)) return { title: "Šablona" };
  return { title: CONTRACT_TYPE_META[type].shortName };
}

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { type } = await params;
  if (!isContractType(type)) notFound();
  // Bundle nemá vlastní editovatelnou šablonu - skládá se ze 3 zdrojových.
  if (isBundleType(type)) notFound();

  const session = await auth();
  if (!session?.user?.email) redirect("/portal/login");
  if (!isAdminRole(session.user?.role)) redirect("/portal");

  const sp = await searchParams;
  let variant: ContractVariant | undefined;
  if (hasVariants(type)) {
    variant =
      sp.variant && isValidVariantForType(type, sp.variant)
        ? (sp.variant as ContractVariant)
        : (getDefaultVariantForType(type) as ContractVariant | undefined);
  }

  const template = await getOrSeedContractTemplate(type, variant);

  return (
    <TemplateEditorClient
      type={type}
      variant={variant}
      initialHtml={template.html}
      updatedAt={template.updatedAt}
      updatedBy={template.updatedBy === "system" ? "výchozí" : template.updatedBy}
      isAdmin
    />
  );
}
