import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export function AuthShell({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="grid min-h-[100dvh] grid-cols-1 md:grid-cols-[1fr_1fr]">
      <section className="relative hidden md:flex md:flex-col md:justify-between bg-ink-base p-12 text-paper">
        <Link href="/" className="inline-flex items-center" aria-label="BOServices home">
          <Logo invert />
        </Link>

        <div className="flex flex-col gap-8">
          <div className="font-extrabold leading-[0.92] tracking-[-0.04em] text-[clamp(2.4rem,4.6vw,4rem)]">
            Provoz prodejen
            <br />
            pod jednou střechou.
          </div>
          <p className="max-w-[40ch] text-[0.98rem] leading-relaxed text-paper/65">
            Portál pro správu klientů, šablon a smluv. Přístup mají jen
            uživatelé v allowlistu — pozvánku posílá administrátor.
          </p>
        </div>

        <div className="text-[10.5px] font-medium uppercase tracking-[0.4em] text-paper/45">
          Provoz · Lidé · Standard · Růst
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-12 md:px-12">
        <div className="w-full max-w-[420px]">
          <Link href="/" className="mb-12 inline-flex items-center md:hidden" aria-label="BOServices home">
            <Logo />
          </Link>

          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mid">
            <span className="mr-3 inline-block h-px w-8 translate-y-[-3px] bg-ink-base/60 align-middle" />
            {eyebrow}
          </div>
          <h1 className="mt-4 font-extrabold text-ink-base text-[clamp(1.9rem,3.6vw,2.5rem)] leading-[1.04] tracking-[-0.035em]">
            {title}
          </h1>
          {lede && (
            <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-deep">
              {lede}
            </p>
          )}

          <div className="mt-10">{children}</div>
        </div>
      </section>
    </main>
  );
}
