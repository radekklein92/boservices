"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Coins, X } from "lucide-react";

export type ClaimsBreakdownEntry = {
  name: string;
  total: number;
  contractsCount: number;
  claimsCount: number;
};

const czk = (n: number) =>
  new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(n);

const contractsWord = (n: number) => (n === 1 ? "smlouvy" : "smluv");

// Postoupené pohledávky - dlaždice na dashboardu. Klik otevře modal s rozpadem
// částky po jednotlivých dlužnících (entitách), tj. kolik pohledávek je
// postoupeno vůči Flowers International, Bubblify International apod.
export function AssignedClaimsPanel({
  total,
  contractsCount,
  breakdown,
}: {
  total: number;
  contractsCount: number;
  breakdown: ClaimsBreakdownEntry[];
}) {
  const [open, setOpen] = useState(false);
  const formatted = czk(total);
  const caption =
    contractsCount === 0
      ? "zatím žádné podepsané postoupení"
      : `vč. DPH · z ${contractsCount} ${contractsWord(contractsCount)}`;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const maxTotal = breakdown.reduce((m, e) => Math.max(m, e.total), 0) || 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={contractsCount === 0}
        className="group relative w-full overflow-hidden rounded-[24px] border border-edge bg-paper p-7 text-left transition-colors hover:border-ink-soft disabled:cursor-default disabled:hover:border-edge"
      >
        <Coins
          className="absolute -bottom-4 -right-4 h-32 w-32 text-ink-base/[0.04]"
          strokeWidth={1}
          aria-hidden="true"
        />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              <Coins className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Postoupené pohledávky
            </div>
            <ArrowUpRight
              className="h-4 w-4 text-ink-mid transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              strokeWidth={1.5}
            />
          </div>
          <div className="mt-5 font-extrabold leading-none tracking-[-0.045em] text-ink-base text-[clamp(2rem,4.6vw,2.85rem)]">
            {formatted}
          </div>
          <div className="mt-2.5 text-[13px] text-ink-mid">{caption}</div>
        </div>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-ink-base/40 px-4 py-6 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
          <div
            className="flex max-h-[82vh] w-full max-w-[560px] flex-col rounded-2xl border border-edge bg-paper shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-6 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-soft">
                  <Coins className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                  Postoupené pohledávky
                </div>
                <div className="mt-1.5 text-[26px] font-extrabold leading-none tracking-[-0.04em] text-ink-base">
                  {formatted}
                </div>
                <div className="mt-1.5 text-[12.5px] text-ink-mid">
                  {caption} · rozpad po dlužnících
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Zavřít"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-soft"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="flex flex-col gap-3.5">
                {breakdown.map((e) => {
                  const pct = Math.round((e.total / total) * 100);
                  return (
                    <div key={e.name} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[14px] font-semibold text-ink-base">
                          {e.name}
                        </span>
                        <span className="shrink-0 text-[14px] font-bold tabular-nums tracking-[-0.01em] text-ink-base">
                          {czk(e.total)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge">
                        <div
                          className="h-full rounded-full bg-ink-base"
                          style={{ width: `${Math.max(2, (e.total / maxTotal) * 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11.5px] text-ink-mid">
                        <span>
                          {e.contractsCount} {contractsWord(e.contractsCount)} ·{" "}
                          {e.claimsCount}{" "}
                          {e.claimsCount === 1 ? "pohledávka" : e.claimsCount < 5 ? "pohledávky" : "pohledávek"}
                        </span>
                        <span className="tabular-nums">{pct} %</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
