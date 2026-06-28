"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { LiveMoverRow, LiveMovers } from "@/lib/portal/pos/types";
import { PosDeltaBadge } from "@/components/portal/pos/PosDeltaBadge";
import { formatPosMoney, formatPosMoneyCompact } from "@/components/portal/pos/pos-shared";

// Panel "Hybatelé dne" na Živě: náhled nej/nejhorších prodejen vs stejný den
// minulý týden "k této hodině". Celý žebříček (všechny prodejny) se otevře v modalu.
export function LiveMoversPanel({ movers }: { movers: LiveMovers }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Hybatelé dne</h2>
        <span className="text-[11.5px] text-ink-soft">
          dnes zatím vs tempo stejného dne minulý týden k této hodině ({Math.round(movers.dayFraction * 100)} % dne)
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MoversCard title="Nejlepší prodejny" tone="up" rows={movers.best} currency={movers.currency} />
        <MoversCard title="Největší pokles" tone="down" rows={movers.worst} currency={movers.currency} />
      </div>
      {movers.all.length > movers.best.length + movers.worst.length && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
          >
            Celý žebříček ({movers.all.length})
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      )}
      {open && <MoversModal movers={movers} onClose={() => setOpen(false)} />}
    </section>
  );
}

function MoversCard({
  title,
  tone,
  rows,
  currency,
}: {
  title: string;
  tone: "up" | "down";
  rows: LiveMoverRow[];
  currency: string;
}) {
  const dot = tone === "up" ? "bg-emerald-500" : "bg-rose-500";
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-edge bg-paper p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        <h3 className="text-[13px] font-semibold text-ink-base">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-[12.5px] text-ink-soft">Zatím žádná prodejna v tomto pásmu.</p>
      ) : (
        <ol className="flex flex-col">
          {rows.map((r, i) => (
            <MoverRow key={r.locationId} rank={i + 1} row={r} currency={currency} />
          ))}
        </ol>
      )}
    </div>
  );
}

function MoverRow({ rank, row, currency }: { rank: number; row: LiveMoverRow; currency: string }) {
  return (
    <li className="flex items-center gap-3 border-b border-edge/60 py-2 last:border-0">
      <span className="w-5 shrink-0 text-right text-[11.5px] tabular-nums text-ink-soft">{rank}</span>
      <span className="flex-1 truncate text-[13px] text-ink-deep" title={row.name}>
        {row.name}
      </span>
      <span
        className="shrink-0 text-right text-[12.5px] tabular-nums text-ink-mid"
        title={formatPosMoney(row.todaySoFar, currency)}
      >
        {formatPosMoneyCompact(row.todaySoFar, currency)}
      </span>
      <PosDeltaBadge
        current={row.todaySoFar}
        previous={row.expectedByNow}
        className="w-16 shrink-0 justify-end text-[11.5px]"
      />
    </li>
  );
}

type SortMode = "narust" | "trzba";

// Řazení celého žebříčku: dle nárůstu (Δ % vs minulý týden, prodejny bez báze na
// konec) nebo dle dnešní tržby. Vrací novou kopii, nemutuje vstup.
function sortMovers(rows: LiveMoverRow[], mode: SortMode): LiveMoverRow[] {
  const out = [...rows];
  if (mode === "trzba") {
    out.sort((a, b) => b.todaySoFar - a.todaySoFar);
  } else {
    out.sort((a, b) => (b.deltaPct ?? -Infinity) - (a.deltaPct ?? -Infinity));
  }
  return out;
}

// Modal s celým žebříčkem hybatelů. Nahoře přepínač řazení (dle nárůstu / dle
// tržby). Konvence modalů portálu (Escape, scroll-lock, klik na pozadí).
function MoversModal({ movers, onClose }: { movers: LiveMovers; onClose: () => void }) {
  const [sort, setSort] = useState<SortMode>("narust");
  const sorted = useMemo(() => sortMovers(movers.all, sort), [movers.all, sort]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-8 backdrop-blur-sm md:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-[640px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">Žebříček</div>
            <h2 className="mt-1 truncate font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Hybatelé dne
            </h2>
            <p className="mt-1 truncate text-[12.5px] text-ink-mid">
              dnes zatím vs tempo stejného dne minulý týden k této hodině ({Math.round(movers.dayFraction * 100)} % dne)
            </p>
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        {movers.all.length > 0 && (
          <div className="mb-2 flex justify-end">
            <div
              role="radiogroup"
              aria-label="Řazení žebříčku"
              className="inline-flex h-9 shrink-0 items-center rounded-full border border-edge bg-paper p-0.5"
            >
              {(
                [
                  { key: "narust", label: "Dle nárůstu" },
                  { key: "trzba", label: "Dle tržby" },
                ] as { key: SortMode; label: string }[]
              ).map((o) => {
                const active = sort === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSort(o.key)}
                    className={`inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-1 focus-visible:ring-offset-paper ${
                      active ? "bg-ink-base text-paper" : "text-ink-mid hover:text-ink-base"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {movers.all.length === 0 ? (
          <p className="py-2 text-[12.5px] text-ink-soft">Zatím žádná prodejna se srovnatelnou bází.</p>
        ) : (
          <ol className="flex flex-col">
            {sorted.map((r, i) => (
              <MoverRow key={r.locationId} rank={i + 1} row={r} currency={movers.currency} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
