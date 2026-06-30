import { notFound, redirect } from "next/navigation";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import {
  isContractType,
  hasVariants,
  isBundleType,
  isValidVariantForType,
  getDefaultVariantForType,
  CONTRACT_TYPE_META,
  type ContractVariant,
} from "@/lib/portal/contract-types";
import { cachedGetOrSeedContractTemplate } from "@/lib/portal/cached-db";
import { maskWho } from "@/lib/portal/masked-account";
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

  const [session, sp] = await Promise.all([getSession(), searchParams]);
  if (!session?.user?.email) redirect("/portal/login");
  if (!isAdminRole(session.user?.role)) redirect("/portal");

  let variant: ContractVariant | undefined;
  if (hasVariants(type)) {
    variant =
      sp.variant && isValidVariantForType(type, sp.variant)
        ? (sp.variant as ContractVariant)
        : (getDefaultVariantForType(type) as ContractVariant | undefined);
  }

  const template = await cachedGetOrSeedContractTemplate(type, variant);

  return (
    <TemplateEditorClient
      type={type}
      variant={variant}
      initialHtml={template.html}
      initialLetterhead={template.letterhead ?? true}
      updatedAt={template.updatedAt}
      updatedBy={template.updatedBy === "system" ? "výchozí" : maskWho(template.updatedBy)}
      isAdmin
    />
  );
}
