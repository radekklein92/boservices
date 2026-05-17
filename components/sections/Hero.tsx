import { useTranslations } from "next-intl";
import { LogoMark } from "@/components/brand/Logo";

export function Hero() {
  const t = useTranslations("hero");

  return (
    <section className="relative isolate overflow-hidden pt-28 md:pt-32">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1280px] grid-cols-1 items-end gap-12 px-5 pb-16 md:grid-cols-[7fr_5fr] md:gap-16 md:px-8 md:pb-24">
        <div className="flex flex-col gap-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mid">
            <span className="mr-3 inline-block h-px w-8 translate-y-[-3px] bg-ink-base/60 align-middle" />
            {t("eyebrow")}
          </div>

          <h1 className="font-extrabold text-ink-base text-[clamp(2.6rem,7.5vw,6.5rem)] leading-[0.92] tracking-[-0.04em]">
            {t("title")}
          </h1>

          <p className="max-w-[42ch] text-[1.075rem] leading-relaxed text-ink-deep md:text-[1.18rem]">
            {t("lede")}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <a
              href="#contact"
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-ink-base px-6 text-[14px] font-semibold text-paper transition-transform duration-200 active:translate-y-px"
            >
              {t("primaryCta")}
              <span
                aria-hidden="true"
                className="transition-transform duration-300 group-hover:translate-x-0.5"
              >
                →
              </span>
            </a>
            <a
              href="#services"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-edge px-6 text-[14px] font-semibold text-ink-base transition-colors hover:bg-edge-warm"
            >
              {t("secondaryCta")}
            </a>
          </div>
        </div>

        <div className="relative flex items-end justify-end">
          <PropellerMark />
        </div>
      </div>

      <PillarRail />
    </section>
  );
}

function PropellerMark() {
  return (
    <div className="relative h-[260px] w-[260px] md:h-[360px] md:w-[360px] lg:h-[420px] lg:w-[420px]">
      <div
        aria-hidden="true"
        className="absolute -inset-10 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(14,14,14,0.05),transparent_55%)]"
      />
      <div
        className="absolute inset-0 [animation:propeller-spin_42s_linear_infinite]"
        style={{ willChange: "transform" }}
      >
        <LogoMark className="h-full w-full" />
      </div>
    </div>
  );
}

function PillarRail() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-12 items-center justify-center md:flex">
      <div className="flex w-full max-w-[1280px] items-center justify-between px-8 text-[10.5px] font-medium uppercase tracking-[0.4em] text-ink-mid">
        <span>Důvěra</span>
        <Dot />
        <span>Struktura</span>
        <Dot />
        <span>Tok</span>
        <Dot />
        <span>Výkon</span>
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-1 w-1 rounded-full bg-ink-soft"
    />
  );
}
