"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { LockKeyhole } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function Navbar() {
  const t = useTranslations("nav");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-50 transition-[backdrop-filter,background-color,border-color] duration-300",
        scrolled
          ? "border-b border-edge/70 bg-paper/80 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      ].join(" ")}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 md:h-[72px] md:px-8">
        <Link href="/" className="-m-1 p-1" aria-label="BOServices home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-9 text-[13px] font-medium text-ink-deep md:flex">
          <a
            href="#services"
            className="relative transition-opacity duration-200 hover:opacity-60"
          >
            {t("services")}
          </a>
          <a
            href="#contact"
            className="relative transition-opacity duration-200 hover:opacity-60"
          >
            {t("contact")}
          </a>
        </nav>

        <div className="flex items-center gap-4 md:gap-6">
          <LocaleSwitcher />
          <NextLink
            href="/portal"
            aria-label="Portál"
            className="hidden h-10 w-10 items-center justify-center rounded-full border border-edge text-ink-deep transition-colors hover:border-ink-base hover:bg-ink-base hover:text-paper md:inline-flex md:h-11 md:w-11"
          >
            <LockKeyhole className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </NextLink>
          <a
            href="#contact"
            className="group inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform duration-200 active:translate-y-px md:h-11"
          >
            {t("cta")}
            <span
              aria-hidden="true"
              className="inline-block translate-x-0 transition-transform duration-300 group-hover:translate-x-0.5"
            >
              →
            </span>
          </a>
        </div>
      </div>
    </header>
  );
}
