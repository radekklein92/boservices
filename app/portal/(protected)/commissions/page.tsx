import { Info } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import {
  cachedGetClaimsOverlay,
  cachedListContracts,
} from "@/lib/portal/cached-db";
import {
  buildCommissionsView,
  isSalespersonEmail,
  salespersonByEmail,
} from "@/lib/portal/commissions";
import {
  listPayouts,
  salespersonAvailable,
  sumPayouts,
} from "@/lib/portal/payouts-db";
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
    listPayouts(),
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

      {/* Pravidla provizí - kompletně a transparentně nahoře */}
      <div className="rounded-2xl border border-edge bg-paper-warm px-5 py-4">
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-mid">
          <Info className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Pravidla provizí
        </div>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-4 text-[13px] leading-relaxed text-ink-deep marker:text-ink-soft">
          <li>
            Provize se vždy dělí <strong>50:50</strong> mezi Tomana a Ebermanna.
          </li>
          <li>
            <strong>Smlouvy</strong> (franšíza, spolupráce, provozování) podepsané
            klientem <strong>do 19. 6. 2026</strong>: každá <strong>10 000 Kč</strong>.
          </li>
          <li>
            Podepsané <strong>od 20. 6. 2026</strong>: počítá se jen{" "}
            <strong>franšíza</strong> - <strong>20 000 Kč</strong> samostatná,{" "}
            <strong>10 000 Kč</strong> pokud je na stejné lokalitě i spolupráce nebo
            provozování. Samostatná smlouva o spolupráci/provozování už provizi
            nezakládá.
          </li>
          <li>
            <strong>Postoupené pohledávky</strong> přes portál u BBI / TD1 / Flowers:{" "}
            <strong>0,1 %</strong> z částky za dlužníka + <strong>0,05 %</strong> za
            každé potvrzené ručení jednou z těch firem (u jedné pohledávky může být i
            obojí). Vše vč. DPH.
          </li>
        </ul>
      </div>

      {/* Výsledky per obchodník */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {cards.map((s) => (
          <SalespersonCard key={s.id} data={s} />
        ))}
      </section>

      {/* Výběry provize (payouty) - nad rozpisem */}
      <CommissionsPayoutsClient rows={payoutRows} isAdmin={isAdmin} />

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
    </div>
  );
}
