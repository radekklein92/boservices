import { redirect } from "next/navigation";
import { Download, FileText, Eye } from "lucide-react";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { PageHeader } from "@/components/portal/shell/PageHeader";

export const metadata = { title: "Design system" };
export const dynamic = "force-dynamic";

const PDF_PATH = "/boservices-design-system.pdf";
const PDF_FILENAME = "BOServices-Design-System.pdf";
const PDF_SIZE_MB = 2.2;

export default async function DesignSystemPage() {
  const session = await getSession();
  if (!session?.user?.email) redirect("/portal/login");
  if (!isAdminRole(session.user?.role)) redirect("/portal");

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Administrace"
        title="Design system"
        lede="Manuál vizuální identity BOServices - barvy, typografie, logo, principy. Stáhněte si PDF a používejte při komunikaci se značkou."
      />

      <section className="overflow-hidden rounded-3xl border border-edge bg-paper">
        <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-6 p-7 md:p-10">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-ink-base text-paper">
                <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div className="flex flex-col">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-mid">
                  PDF dokument
                </div>
                <h2 className="text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
                  BOServices - Design System
                </h2>
              </div>
            </div>

            <p className="max-w-[48ch] text-[13.5px] leading-relaxed text-ink-deep">
              Kompletní manuál: logo a jeho použití, barevná paleta, typografie
              Manrope, principy fotografie a tone of voice. Sdílejte interně,
              s designéry, agenturami a externími dodavateli.
            </p>

            <dl className="grid grid-cols-2 gap-4 border-t border-edge pt-5 text-[12.5px]">
              <div className="flex flex-col gap-0.5">
                <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mid">
                  Formát
                </dt>
                <dd className="font-mono text-ink-base">PDF</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mid">
                  Velikost
                </dt>
                <dd className="font-mono text-ink-base">
                  {PDF_SIZE_MB.toFixed(1)} MB
                </dd>
              </div>
            </dl>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <a
                href={PDF_PATH}
                download={PDF_FILENAME}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px"
              >
                <Download className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                Stáhnout PDF
              </a>
              <a
                href={PDF_PATH}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-edge px-5 text-[13.5px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
              >
                <Eye className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                Otevřít v prohlížeči
              </a>
            </div>
          </div>

          <div className="relative hidden bg-paper-warm md:block">
            <embed
              src={`${PDF_PATH}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`}
              type="application/pdf"
              className="absolute inset-0 h-full w-full"
              aria-label="Náhled design systemu"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
