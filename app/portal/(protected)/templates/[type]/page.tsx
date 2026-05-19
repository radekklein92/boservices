import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/portal/auth-guard";
import {
  isContractType,
  isFranchiseVariant,
  hasVariants,
  isBundleType,
  CONTRACT_TYPE_META,
  DEFAULT_FRANCHISE_VARIANT,
  type FranchiseVariant,
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
  let variant: FranchiseVariant | undefined;
  if (hasVariants(type)) {
    variant =
      sp.variant && isFranchiseVariant(sp.variant)
        ? sp.variant
        : DEFAULT_FRANCHISE_VARIANT;
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
