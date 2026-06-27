import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal/get-session";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { PosTabs } from "@/components/portal/pos/PosTabs";
import { PosSyncBadge } from "@/components/portal/pos/PosSyncBadge";
import { PosFilterBarLoader } from "@/components/portal/pos/PosFilterBarLoader";
import { FilterBarSkeleton } from "@/components/portal/pos/skeletons";

// POS / pokladní sekce vidí manager + admin + superadmin. Náhled role ("view as")
// se promítá - getSession vrací efektivní roli. Hlavička + taby žijí v layoutu ->
// persistují napříč POS obrazovkami.
//
// PERF: layout NEčeká na data (značky/pobočky/sync) - shell (h1 + taby) paintne
// hned, filtr i badge dostreamují pod <Suspense>. Tím odpadá ~1,5 s blokujícího
// fetche před prvním vykreslením na KAŽDÉ POS stránce.
export const dynamic = "force-dynamic";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) redirect("/portal");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink-base">
          Tržby
        </h1>
        <Suspense fallback={null}>
          <PosSyncBadge />
        </Suspense>
      </div>
      <PosTabs />
      <Suspense fallback={<FilterBarSkeleton />}>
        <PosFilterBarLoader />
      </Suspense>
      {children}
    </div>
  );
}
