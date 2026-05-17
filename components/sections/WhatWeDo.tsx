import { useTranslations } from "next-intl";
import { Boxes, Users, LineChart, Sprout } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type Item = {
  key: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const items: Item[] = [
  { key: "ops", Icon: Boxes },
  { key: "people", Icon: Users },
  { key: "finance", Icon: LineChart },
  { key: "growth", Icon: Sprout },
];

export function WhatWeDo() {
  const t = useTranslations("what");

  return (
    <section
      id="services"
      className="relative border-t border-edge bg-paper-warm py-24 md:py-32"
    >
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-14 px-5 md:grid-cols-[5fr_7fr] md:gap-20 md:px-8">
        <div className="flex flex-col gap-6 md:sticky md:top-32 md:self-start">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mid">
            <span className="mr-3 inline-block h-px w-8 translate-y-[-3px] bg-ink-base/60 align-middle" />
            {t("eyebrow")}
          </div>
          <h2 className="font-extrabold text-ink-base text-[clamp(2rem,4.5vw,3.6rem)] leading-[0.98] tracking-[-0.035em]">
            {t("title")}
          </h2>
          <p className="max-w-[42ch] text-[1.025rem] leading-relaxed text-ink-deep">
            {t("lede")}
          </p>
        </div>

        <ul className="flex flex-col">
          {items.map(({ key, Icon }, index) => (
            <li
              key={key}
              className="group relative grid grid-cols-[auto_1fr_auto] items-start gap-6 border-t border-edge py-8 first:border-t-0 md:gap-10 md:py-10"
            >
              <span className="font-mono text-[12px] tracking-tight text-ink-soft md:text-[13px]">
                0{index + 1}
              </span>
              <div className="flex flex-col gap-2.5">
                <h3 className="text-[1.45rem] font-bold tracking-[-0.02em] text-ink-base md:text-[1.7rem]">
                  {t(`items.${key}.title`)}
                </h3>
                <p className="max-w-[58ch] text-[0.985rem] leading-relaxed text-ink-deep">
                  {t(`items.${key}.body`)}
                </p>
              </div>
              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border border-edge text-ink-base transition-colors duration-300 group-hover:border-ink-base group-hover:bg-ink-base group-hover:text-paper md:flex">
                <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
