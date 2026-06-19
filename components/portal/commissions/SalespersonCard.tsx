import { HandCoins } from "lucide-react";
import { formatCzkRounded } from "@/lib/portal/claims";
import type { SalespersonCommission } from "@/lib/portal/commissions";

const franchiseWord = (n: number) =>
  n === 1 ? "franšíza" : n >= 2 && n <= 4 ? "franšízy" : "franšíz";

// Výsledková karta obchodníka (Toman / Ebermann). Stejný vizuál jako dlaždice
// dashboardu (SecondaryStat / AssignedClaimsPanel). Čistě presentational, sdílí
// ji dashboard i stránka /portal/commissions.
export function SalespersonCard({ data }: { data: SalespersonCommission }) {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-edge bg-paper p-7">
      <HandCoins
        className="absolute -bottom-4 -right-4 h-32 w-32 text-ink-base/[0.04]"
        strokeWidth={1}
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          <HandCoins className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          {data.name}
        </div>
        <div className="mt-5 font-extrabold leading-none tracking-[-0.045em] text-ink-base text-[clamp(2rem,4.6vw,2.85rem)]">
          {formatCzkRounded(data.total)}
        </div>
        <div className="mt-4 flex flex-col gap-1.5 text-[12.5px] text-ink-mid">
          <div className="flex items-baseline justify-between gap-3">
            <span>
              Franšízy
              <span className="text-ink-soft">
                {" "}
                · {data.franchiseCount} {franchiseWord(data.franchiseCount)}
              </span>
            </span>
            <span className="font-semibold text-ink-deep">
              {formatCzkRounded(data.franchiseCommission)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span>
              Pohledávky
              <span className="text-ink-soft"> · 0,1 %</span>
            </span>
            <span className="font-semibold text-ink-deep">
              {formatCzkRounded(data.claimCommission)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
