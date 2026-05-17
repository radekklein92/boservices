import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { isContractType, CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
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
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!isContractType(type)) notFound();

  const session = await auth();
  const isAdmin = isAdminRole(session?.user?.role);
  const template = await getOrSeedContractTemplate(type);

  return (
    <TemplateEditorClient
      type={type}
      initialHtml={template.html}
      updatedAt={template.updatedAt}
      updatedBy={template.updatedBy === "system" ? "výchozí" : template.updatedBy}
      isAdmin={isAdmin}
    />
  );
}
