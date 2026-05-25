import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { ContactForm } from "@/components/ui/ContactForm";

// Veřejný odkaz do obchodního rejstříku pro BOServices s.r.o. Stejný napříč
// lokacemi, proto nejde přes i18n.
const JUSTICE_URL =
  "https://or.justice.cz/ias/ui/rejstrik-firma.vysledky?subjektId=1309164&typ=PLATNY";

export function Contact() {
  const t = useTranslations("contact");

  return (
    <section
      id="contact"
      className="relative border-t border-edge bg-paper py-24 md:py-32"
    >
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-14 px-5 md:grid-cols-[5fr_7fr] md:gap-20 md:px-8">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              <span className="mr-3 inline-block h-px w-8 translate-y-[-3px] bg-ink-base/60 align-middle" />
              {t("eyebrow")}
            </div>
            <h2 className="font-extrabold text-ink-base text-[clamp(2rem,4.5vw,3.4rem)] leading-[0.98] tracking-[-0.035em]">
              {t("title")}
            </h2>
            <p className="max-w-[42ch] text-[1.025rem] leading-relaxed text-ink-deep">
              {t("lede")}
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 border-t border-edge pt-8 text-[14px] leading-relaxed sm:grid-cols-2">
            <DetailRow
              label={t("details.addressLabel")}
              value={t("details.address")}
            />
            <DetailRow
              label={t("details.icoLabel")}
              value={t("details.ico")}
              mono
            />
            <DetailRow
              label={t("details.dicLabel")}
              value={t("details.dic")}
              mono
            />
          </dl>

          <div className="pt-2">
            <a
              href={JUSTICE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="group inline-flex h-12 items-center gap-2.5 rounded-full border border-edge bg-paper px-6 text-[14px] font-semibold text-ink-base transition-colors hover:border-ink-base hover:bg-ink-base hover:text-paper"
            >
              {t("justiceLink")}
              <ArrowUpRight
                className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </a>
          </div>
        </div>

        <ContactForm />
      </div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mid">
        {label}
      </dt>
      <dd
        className={[
          "text-[15px] text-ink-base",
          mono ? "font-mono tracking-tight" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
