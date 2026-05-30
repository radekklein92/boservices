import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { cachedListContractTemplates } from "@/lib/portal/cached-db";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getTemplateApprovers } from "@/lib/portal/users-db";
import { isTemplateApproved } from "@/lib/portal/contract-templates-db";
import { TemplatesListClient, type TemplateRow } from "@/components/portal/contracts/TemplatesListClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Šablony smluv" };

export default async function TemplatesPage() {
  const [session, entries, approvers] = await Promise.all([
    getSession(),
    cachedListContractTemplates(),
    getTemplateApprovers(),
  ]);
  if (!session?.user?.email) redirect("/portal/login");
  if (!isAdminRole(session.user?.role)) redirect("/portal");

  // Flat list: typy bez variant 1×, typy s variantami (franchise, withdrawal)
  // jednou per variantu - každá se schvaluje samostatně.
  const rows: TemplateRow[] = [];
  for (const e of entries) {
    if (e.variants && e.variants.length > 0) {
      for (const v of e.variants) {
        rows.push({
          type: e.type,
          variant: v.variant,
          fullName: e.meta.fullName,
          shortName: e.meta.shortName,
          description: e.meta.description,
          template: v.template,
          approved: isTemplateApproved(v.template),
        });
      }
    } else {
      rows.push({
        type: e.type,
        fullName: e.meta.fullName,
        shortName: e.meta.shortName,
        description: e.meta.description,
        template: e.template,
        approved: isTemplateApproved(e.template),
      });
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Administrace"
        title="Šablony smluv"
        lede="Šablony se musí schválit. Po každé editaci je nutné schválení znovu. Smlouvy vytvořené ze schválené verze jsou automaticky v pořádku."
      />
      <TemplatesListClient
        rows={rows}
        currentUserEmail={session.user.email}
        approverEmails={approvers.map((a) => a.email)}
      />
    </div>
  );
}
