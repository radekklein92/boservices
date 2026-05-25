import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { Hero } from "@/components/sections/Hero";
import { WhatWeDo } from "@/components/sections/WhatWeDo";
import { People } from "@/components/sections/People";
import { Contact } from "@/components/sections/Contact";

// Náhled původního marketingového webu na neveřejné URL. Hlavní landing
// (/) je zatím coming-soon. Tady běží stará verze, kterou si může klient
// projít / sdílet se stakeholdery. Není linkovaná z navigace.

export const metadata: Metadata = {
  title: "Preview – BOServices",
  description: "Náhled nové marketingové prezentace.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      {/* Banner viditelný jen na preview - aby bylo jasné, že to není
          produkční web. Sticky top, decentní. */}
      <div className="sticky top-0 z-50 flex items-center justify-center gap-2.5 border-b border-edge bg-paper-warm px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-mid">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-base opacity-40" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink-base" />
        </span>
        Preview · neveřejná verze · neindexováno
      </div>

      <Navbar />
      <main>
        <Hero />
        <WhatWeDo />
        <People />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
