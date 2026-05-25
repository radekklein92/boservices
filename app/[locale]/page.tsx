import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { ArrowUpRight } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";

// Hlavní web je dočasně shozený. Záměrně minimální stránka - mark + claim +
// vstup do portálu. Plný marketing web (Hero/WhatWeDo/People/Contact) je
// zatím orphaned v components/sections, kdyby ho chtěl klient vrátit zpět.

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-paper-warm">
      {/* Ambient radial highlight - jemný "spotlight" za logem. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 50% 38%, rgba(14,14,14,0.04), transparent 70%)",
        }}
      />

      {/* Dot grid v pozadí - decentní, neruší. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(14,14,14,0.08) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent)",
        }}
      />

      {/* Editorial grid lines - 1/3 a 2/3. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 top-[33.33%] h-px bg-ink-base/[0.04]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 top-[66.66%] h-px bg-ink-base/[0.04]"
      />

      {/* Top bar: wordmark + locale info, žádný plný navbar. */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-12 md:py-8">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-6 w-6" />
          <span className="text-[13px] font-extrabold tracking-tight text-ink-base">
            BOServices
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          <span className="hidden sm:inline">Praha · fra1</span>
          <span className="h-1 w-1 rounded-full bg-ink-soft" aria-hidden="true" />
          <span>{locale.toUpperCase()}</span>
        </div>
      </header>

      {/* Main content - centered, generous whitespace. */}
      <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-200px)] max-w-[1100px] flex-col items-center justify-center px-6 py-12 text-center">
        {/* Eyebrow s tenkou linkou na obou stranách. */}
        <div className="flex items-center gap-4 text-[10.5px] font-semibold uppercase tracking-[0.32em] text-ink-mid animate-[fadeUp_1s_ease-out_both]">
          <span aria-hidden="true" className="h-px w-10 bg-ink-soft" />
          Business Operations Services
          <span aria-hidden="true" className="h-px w-10 bg-ink-soft" />
        </div>

        {/* Logo mark - centrální, mírně nadrozměrný. */}
        <div className="mt-10 animate-[fadeUp_1s_ease-out_0.05s_both]">
          <LogoMark className="h-28 w-28 md:h-32 md:w-32" />
        </div>

        {/* Display headline - Manrope ExtraBold, extreme negative tracking. */}
        <h1 className="mt-10 font-extrabold leading-[0.95] tracking-[-0.045em] text-ink-base text-[clamp(2.75rem,8vw,5.25rem)] animate-[fadeUp_1s_ease-out_0.15s_both]">
          Něco velkého
          <br />
          <span className="italic font-bold text-ink-deep">se připravuje.</span>
        </h1>

        {/* Subtitle. */}
        <p className="mt-7 max-w-[42ch] text-[15.5px] leading-relaxed text-ink-mid animate-[fadeUp_1s_ease-out_0.25s_both]">
          Spouštíme nový web pro Business Operations Services.
          <br className="hidden sm:block" />
          Mezitím máte plný přístup do interního portálu.
        </p>

        {/* Live status pill - pulsing dot + label. */}
        <div className="mt-10 inline-flex items-center gap-2.5 rounded-full border border-edge bg-paper px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-deep shadow-[0_1px_2px_rgba(14,14,14,0.04)] animate-[fadeUp_1s_ease-out_0.35s_both]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-base opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ink-base" />
          </span>
          Ve výstavbě
        </div>

        {/* Primary CTA - velký, černý, premium shadow. */}
        <div className="mt-12 animate-[fadeUp_1s_ease-out_0.45s_both]">
          <Link
            href="/portal/login"
            className="group inline-flex h-14 items-center gap-3 rounded-full bg-ink-base px-8 text-[14.5px] font-semibold text-paper shadow-[0_8px_24px_-8px_rgba(14,14,14,0.45)] transition-all duration-200 hover:shadow-[0_12px_32px_-8px_rgba(14,14,14,0.55)] active:translate-y-px"
          >
            Přihlásit do portálu
            <ArrowUpRight
              className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              strokeWidth={2}
              aria-hidden="true"
            />
          </Link>
        </div>
      </main>

      {/* Decentní footer. */}
      <footer className="relative z-10 px-6 py-8 md:px-12">
        <div className="flex flex-col items-center justify-between gap-3 border-t border-edge pt-6 text-[11px] text-ink-mid sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="font-mono text-ink-soft">©</span>
            <span>Business Operations Services s.r.o. · 2026</span>
          </div>
          <div className="font-mono uppercase tracking-[0.18em] text-ink-soft">
            v.2026.05
          </div>
        </div>
      </footer>

      {/* Keyframes pro fade-up entrance animaci. */}
      <style>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
