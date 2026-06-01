import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Sjednocený „zpět" odkaz na detailových stránkách.
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-2 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      {children}
    </Link>
  );
}
