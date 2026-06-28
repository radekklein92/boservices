"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { formatCzkRounded } from "@/lib/portal/claims";
import type {
  Payout,
  PayoutBillingInfo,
  PayoutCustomerSnapshot,
} from "@/lib/portal/payouts-db";
import type { SalespersonId } from "@/lib/portal/commissions";
import { PayoutManagerModal } from "./PayoutManagerModal";

export interface PayoutSalespersonRow {
  id: SalespersonId;
  name: string;
  commission: number; // jeho půlka provize
  paidOut: number; // už vybráno (všechny stavy)
  available: number; // k dispozici
  payouts: Payout[];
  lastBilling?: PayoutBillingInfo; // pre-fill z posledního výběru
  lastCustomer?: PayoutCustomerSnapshot;
}

// Sekce "Výběry provize" - per obchodník řádek + modal pro správu výběrů.
export function CommissionsPayoutsClient({
  rows,
  isAdmin,
}: {
  rows: PayoutSalespersonRow[];
  isAdmin: boolean;
}) {
  const [openId, setOpenId] = useState<SalespersonId | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  if (rows.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
          Výběry provize
        </h2>
        <span className="hidden text-[12px] text-ink-mid md:inline">
          · podklad → faktura → zadáno k úhradě → uhrazeno
        </span>
      </div>
      <div className="overflow-hidden rounded-3xl border border-edge bg-paper">
        <ul className="divide-y divide-edge">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-paper-warm md:flex-row md:items-center md:gap-6 md:px-7 md:py-6"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold tracking-[-0.01em] text-ink-base">
                  {r.name}
                </div>
                <div className="text-[12.5px] text-ink-mid">
                  {r.payouts.length === 0
                    ? "zatím žádné výběry"
                    : `${r.payouts.length} ${r.payouts.length === 1 ? "výběr" : r.payouts.length < 5 ? "výběry" : "výběrů"}`}
                </div>
              </div>
              <div className="flex items-center gap-6">
                <Stat label="Provize" value={r.commission} />
                <Stat label="Vybráno" value={r.paidOut} />
                <Stat label="K dispozici" value={r.available} highlight />
              </div>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-base md:ml-2"
              >
                <Settings className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                Spravovat
              </button>
            </li>
          ))}
        </ul>
      </div>

      {open && (
        <PayoutManagerModal
          row={open}
          isAdmin={isAdmin}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex w-[110px] flex-col gap-0.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
        {label}
      </div>
      <div
        className={`text-[14px] font-bold tabular-nums ${highlight ? "text-ink-base" : "text-ink-deep"}`}
      >
        {formatCzkRounded(value)}
      </div>
    </div>
  );
}
