import { useTranslations } from "next-intl";
import { ContactForm } from "@/components/ui/ContactForm";

export function Contact() {
  const t = useTranslations("contact");

  return (
    <section
      id="contact"
      className="relative border-t border-edge bg-paper-warm py-24 md:py-32"
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
            <DetailRow
              label={t("details.groupLabel")}
              value={t("details.group")}
            />
          </dl>
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
  value: string;
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
