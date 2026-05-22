import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, FileEdit } from "lucide-react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { cachedListContractTemplates } from "@/lib/portal/cached-db";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Šablony smluv" };

export default async function TemplatesPage() {
  const [session, items] = await Promise.all([
    getSession(),
    cachedListContractTemplates(),
  ]);
  if (!session?.user?.email) redirect("/portal/login");
  if (!isAdminRole(session.user?.role)) redirect("/portal");

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Administrace"
        title="Šablony smluv"
        lede="Šest typů smluv. Šablona drží výchozí znění; při generování pro konkrétního klienta se placeholdery nahradí jeho daty."
      />

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map(({ type, meta, template }) => (
          <li key={type}>
            <Link
              href={`/portal/templates/${type}`}
              className="group flex h-full flex-col justify-between gap-5 rounded-2xl border border-edge bg-paper p-6 transition-colors hover:border-ink-base"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-edge-warm text-ink-base transition-colors group-hover:bg-ink-base group-hover:text-paper">
                    <FileEdit className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <ArrowUpRight
                    className="h-4 w-4 text-ink-mid transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    strokeWidth={1.5}
                  />
                </div>
                <h2 className="mt-5 text-[1.05rem] font-bold leading-snug tracking-[-0.015em] text-ink-base">
                  {meta.fullName}
                </h2>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-mid">
                  {meta.description}
                </p>
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-mid">
                <span className="font-mono uppercase tracking-[0.18em] text-ink-soft">
                  {meta.shortName}
                </span>
                <span>
                  {template?.updatedAt
                    ? `upraveno ${new Date(template.updatedAt).toLocaleDateString("cs-CZ")}`
                    : "výchozí znění"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
