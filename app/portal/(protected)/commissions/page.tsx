import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import {
  cachedGetClaimsOverlay,
  cachedListContracts,
} from "@/lib/portal/cached-db";
import { buildCommissionsView } from "@/lib/portal/commissions";
import { formatCzkRounded } from "@/lib/portal/claims";
import { SalespersonCard } from "@/components/portal/commissions/SalespersonCard";
import { CommissionsAssignClient } from "@/components/portal/commissions/CommissionsAssignClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Provizní výsledky" };

const contractWord = (n: number) =>
  n === 1 ? "smlouva" : n >= 2 && n <= 4 ? "smlouvy" : "smluv";

export default async function CommissionsPage() {
  const [session, contracts, overlay] = await Promise.all([
    getSession(),
    cachedListContracts(),
    cachedGetClaimsOverlay(),
  ]);
  const isAdmin = isAdminRole(session?.user?.role);
  const view = buildCommissionsView(contracts, overlay);

  // Přiřazovací tabulka: needs-attention (podepsané bez obchodníka) nahoru, pak
  // podepsané, pak ostatní; v rámci skupiny nejnovější podpis první.
  const sortedRows = [...view.contracts].sort((a, b) => {
    const aAttn = a.signed && a.salespeople.length === 0 ? 0 : 1;
    const bAttn = b.signed && b.salespeople.length === 0 ? 0 : 1;
    if (aAttn !== bAttn) return aAttn - bAttn;
    if (a.signed !== b.signed) return a.signed ? -1 : 1;
    return (b.signedAt ?? "").localeCompare(a.signedAt ?? "");
  });

  const unassignedCount = view.unassigned.contractIds.length;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Franšízing"
        title="Provizní výsledky"
        lede="Provize obchodníků za podepsané franšízy (20 000 Kč) a postoupené pohledávky u BBI, TD1 a Flowers (0,1 % vč. ručení). Při dvou obchodnících se provize dělí na poloviny."
      />

      {/* Výsledky per obchodník - vidí všichni přihlášení. */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {view.bySalesperson.map((s) => (
          <SalespersonCard key={s.id} data={s} />
        ))}
      </section>

      {unassignedCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-[13px] leading-relaxed text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>
            <strong>
              {unassignedCount} {contractWord(unassignedCount)}
            </strong>{" "}
            bez přiřazeného obchodníka generuje provizi{" "}
            <strong>{formatCzkRounded(view.unassigned.total)}</strong>, která
            zatím nikomu nepřipadá.
            {isAdmin
              ? " Doplňte obchodníka v tabulkách níže."
              : ""}
          </span>
        </div>
      )}

      {/* Přiřazování obchodníků - jen admin. */}
      {isAdmin && <CommissionsAssignClient rows={sortedRows} />}
    </div>
  );
}
