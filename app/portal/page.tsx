import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { Logo } from "@/components/brand/Logo";

export default async function PortalDashboardPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/portal/login");
  }

  return (
    <main className="mx-auto max-w-[1100px] px-5 py-12 md:px-8 md:py-16">
      <div className="flex items-center justify-between">
        <Logo />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/portal/login" });
          }}
        >
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-full border border-edge px-4 text-[12px] font-medium text-ink-deep transition-colors hover:bg-edge-warm"
          >
            Odhlásit
          </button>
        </form>
      </div>

      <div className="mt-16">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          <span className="mr-3 inline-block h-px w-8 translate-y-[-3px] bg-ink-base/60 align-middle" />
          Portál — Fáze 1 (auth foundation)
        </div>
        <h1 className="mt-4 font-extrabold text-ink-base text-[clamp(2rem,4.6vw,3.2rem)] leading-[1.02] tracking-[-0.035em]">
          Vítejte, {session.user.name ?? session.user.email}.
        </h1>
        <p className="mt-4 max-w-[60ch] text-[1.025rem] leading-relaxed text-ink-deep">
          Auth foundation běží. Další moduly (Klienti, Šablony, Smlouvy,
          Uživatelé) přijdou v dalších fázích.
        </p>

        <dl className="mt-12 grid grid-cols-1 gap-x-8 gap-y-6 border-t border-edge pt-10 text-[14px] sm:grid-cols-3">
          <Row label="E-mail" value={session.user.email!} />
          <Row label="Role" value={session.user.role ?? "—"} />
          <Row label="Jméno" value={session.user.name ?? "—"} />
        </dl>

        <div className="mt-12 flex flex-wrap gap-3 text-[12px] uppercase tracking-[0.18em] text-ink-mid">
          <span>Provoz</span>
          <Dot />
          <span>Lidé</span>
          <Dot />
          <span>Standard</span>
          <Dot />
          <span>Růst</span>
        </div>
      </div>

      <p className="mt-20 text-[12px] text-ink-mid">
        <Link href="/" className="underline underline-offset-2 transition-opacity hover:opacity-70">
          Zpět na boservices.cz
        </Link>
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mid">
        {label}
      </dt>
      <dd className="text-[15px] text-ink-base">{value}</dd>
    </div>
  );
}

function Dot() {
  return <span aria-hidden="true" className="inline-block h-1 w-1 self-center rounded-full bg-ink-soft" />;
}
