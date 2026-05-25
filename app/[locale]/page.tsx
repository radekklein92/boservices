import { setRequestLocale } from "next-intl/server";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { Hero } from "@/components/sections/Hero";
import { WhatWeDo } from "@/components/sections/WhatWeDo";
import { Contact } from "@/components/sections/Contact";

// Veřejný marketing web BOServices. Po krátké fázi "coming soon" launchnut
// zpět - sekce Hero → WhatWeDo → Contact + Navbar/Footer. Metadata
// (title/description/OG) přicházejí z layoutu [locale]/layout.tsx.

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <WhatWeDo />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
