import { useTranslations, useLocale } from "next-intl";
import { directors, type Director } from "@/lib/people";

export function People() {
  const t = useTranslations("people");
  const locale = useLocale() as "cs" | "en";

  return (
    <section id="people" className="border-t border-edge py-24 md:py-32">
      <div className="mx-auto max-w-[1280px] px-5 md:px-8">
        <header className="grid grid-cols-1 gap-6 md:grid-cols-[5fr_7fr] md:gap-20">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mid">
            <span className="mr-3 inline-block h-px w-8 translate-y-[-3px] bg-ink-base/60 align-middle" />
            {t("eyebrow")}
          </div>
          <div className="flex flex-col gap-5">
            <h2 className="font-extrabold text-ink-base text-[clamp(2rem,4.5vw,3.6rem)] leading-[0.98] tracking-[-0.035em]">
              {t("title")}
            </h2>
            <p className="max-w-[52ch] text-[1.025rem] leading-relaxed text-ink-deep">
              {t("lede")}
            </p>
          </div>
        </header>

        <div className="mt-16 grid grid-cols-1 gap-x-6 gap-y-10 md:mt-24 md:grid-cols-12 md:gap-y-16">
          <div className="md:col-span-5 md:col-start-1">
            <DirectorCard person={directors[0]} locale={locale} index={1} />
          </div>
          <div className="md:col-span-5 md:col-start-7 md:mt-24">
            <DirectorCard person={directors[1]} locale={locale} index={2} />
          </div>
          <div className="md:col-span-5 md:col-start-3">
            <DirectorCard person={directors[2]} locale={locale} index={3} />
          </div>
        </div>

        <p className="mt-20 max-w-[40ch] border-t border-edge pt-6 text-[12px] uppercase tracking-[0.18em] text-ink-mid">
          {t("groupNote")}
        </p>
      </div>
    </section>
  );
}

function DirectorCard({
  person,
  locale,
  index,
}: {
  person: Director;
  locale: "cs" | "en";
  index: number;
}) {
  return (
    <article className="group flex flex-col gap-5">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[28px] bg-ink-base text-paper">
        <span className="absolute right-5 top-5 font-mono text-[11px] tracking-wide text-paper/55">
          0{index} / 03
        </span>

        <div className="absolute inset-0 flex items-end p-7">
          <span
            className="font-extrabold leading-[0.85] tracking-[-0.05em] text-paper"
            style={{ fontSize: "clamp(6rem, 14vw, 11rem)" }}
          >
            {person.initials}
          </span>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.06),transparent_55%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[1.25rem] font-bold tracking-[-0.02em] text-ink-base">
            {person.titlePrefix
              ? `${person.titlePrefix} ${person.fullName}`
              : person.fullName}
          </h3>
          <span className="font-mono text-[11px] text-ink-mid">
            {person.yearOfBirth}
          </span>
        </div>
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mid">
          {person.role[locale]}
        </div>
        <p className="mt-2 max-w-[40ch] text-[0.95rem] leading-relaxed text-ink-deep">
          {person.bio[locale]}
        </p>
      </div>
    </article>
  );
}
