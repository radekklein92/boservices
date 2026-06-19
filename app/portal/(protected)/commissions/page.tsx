import { Info } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import {
  cachedGetClaimsOverlay,
  cachedListContracts,
  cachedListPayouts,
} from "@/lib/portal/cached-db";
import {
  buildCommissionsView,
  isSalespersonEmail,
  salespersonByEmail,
} from "@/lib/portal/commissions";
import { salespersonAvailable, sumPayouts } from "@/lib/portal/payouts-db";
import { formatCzkRounded } from "@/lib/portal/claims";
import { SalespersonCard } from "@/components/portal/commissions/SalespersonCard";
import {
  CommissionsPayoutsClient,
  type PayoutSalespersonRow,
} from "@/components/portal/commissions/CommissionsPayoutsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Provizní výsledky" };

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default async function CommissionsPage() {
  const [session, contracts, overlay, payouts] = await Promise.all([
    getSession(),
    cachedListContracts(),
    cachedGetClaimsOverlay(),
    cachedListPayouts(),
  ]);
  const email = session?.user?.email;
  const isAdmin = isAdminRole(session?.user?.role);
  const me = salespersonByEmail(email);
  // Vidí jen admini + sami obchodníci (Toman/Ebermann).
  if (!isAdmin && !isSalespersonEmail(email)) notFound();

  const view = buildCommissionsView(contracts, overlay);

  // Co uživatel vidí: admin oba, obchodník jen sebe.
  const visibleIds = isAdmin
    ? view.bySalesperson.map((s) => s.id)
    : me
      ? [me.id]
      : [];
  const cards = view.bySalesperson.filter((s) => visibleIds.includes(s.id));

  const payoutRows: PayoutSalespersonRow[] = cards.map((s) => {
    const theirs = payouts
      .filter((p) => p.salespersonId === s.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      id: s.id,
      name: s.name,
      commission: s.total,
      paidOut: sumPayouts(theirs),
      available: salespersonAvailable(s.total, theirs),
      payouts: theirs,
      lastBilling: theirs[0]?.billing,
      lastCustomer: theirs[0]?.customer,
    };
  });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Franšízing"
        title="Provizní výsledky"
        lede="Provize za podepsané smlouvy a postoupené pohledávky u BBI, TD1 a Flowers (0,1 % vč. ručení). Vždy se dělí 50:50 mezi Tomana a Ebermanna."
      />

      {/* Info o změně pravidel od 20.6.2026 */}
      <div className="flex items-start gap-3 rounded-2xl border border-edge bg-paper-warm px-5 py-4 text-[13px] leading-relaxed text-ink-deep">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-mid" strokeWidth={1.5} aria-hidden="true" />
        <span>
          <strong>Od 20. 6. 2026</strong> se mění pravidlo u franšíz: za
          samostatnou franšízu <strong>20 000 Kč</strong>, za franšízu s navázanou
          smlouvou o spolupráci nebo provozování (stejná lokalita){" "}
          <strong>10 000 Kč</strong>; samostatná smlouva o spolupráci/provozování
          už provizi nezakládá. Smlouvy podepsané klientem do 19. 6. 2026 zůstávají
          10 000 Kč za kus.
        </span>
      </div>

      {/* Výsledky per obchodník */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {cards.map((s) => (
          <SalespersonCard key={s.id} data={s} />
        ))}
      </section>

      {/* Rozpis jednotlivých provizí (read-only, celé částky před 50:50) */}
      {view.rows.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
              Rozpis provizí
            </h2>
            <span className="font-mono text-[12px] text-ink-soft">
              {view.rows.length.toString().padStart(2, "0")}
            </span>
            <span className="hidden text-[12px] text-ink-mid md:inline">
              · celkem {formatCzkRounded(view.total)} (děleno 50:50)
            </span>
          </div>
          <div className="overflow-hidden rounded-[24px] border border-edge bg-paper">
            <ul className="divide-y divide-edge">
              {view.rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper-warm md:px-7"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink-base">
                        {r.clientName || "Bez názvu klienta"}
                      </span>
                      {r.number && (
                        <span className="font-mono text-[11.5px] text-ink-soft">
                          {r.number}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[12px] text-ink-mid">
                      {r.label}
                      {r.note ? ` · ${r.note}` : ""} · {formatDate(r.signedAt)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[14px] font-bold tabular-nums text-ink-base">
                    {formatCzkRounded(r.commission)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Výběry provize (payouty) */}
      <CommissionsPayoutsClient rows={payoutRows} isAdmin={isAdmin} />
    </div>
  );
}
