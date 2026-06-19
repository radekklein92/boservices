import { notFound } from "next/navigation";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import {
  cachedGetClaimsOverlay,
  cachedListContracts,
} from "@/lib/portal/cached-db";
import { buildCommissionsView, isSalespersonEmail } from "@/lib/portal/commissions";
import { SalespersonCard } from "@/components/portal/commissions/SalespersonCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Provizní výsledky" };

export default async function CommissionsPage() {
  const [session, contracts, overlay] = await Promise.all([
    getSession(),
    cachedListContracts(),
    cachedGetClaimsOverlay(),
  ]);
  // Vidí jen admini + sami obchodníci (Toman/Ebermann).
  const canSee =
    isAdminRole(session?.user?.role) || isSalespersonEmail(session?.user?.email);
  if (!canSee) notFound();

  const view = buildCommissionsView(contracts, overlay);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Franšízing"
        title="Provizní výsledky"
        lede="20 000 Kč za podepsanou franšízu + 0,1 % z postoupených pohledávek u BBI, TD1 a Flowers (vč. ručení). Provize se vždy dělí 50:50 mezi Tomana a Ebermanna."
      />

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {view.bySalesperson.map((s) => (
          <SalespersonCard key={s.id} data={s} />
        ))}
      </section>
    </div>
  );
}
