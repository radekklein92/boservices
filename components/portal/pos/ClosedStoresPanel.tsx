"use client";

import { useEffect, useState } from "react";
import { DoorClosed, X } from "lucide-react";
import type { ClosedStoreRow, ClosedStoresReport } from "@/lib/portal/pos/types";
import { CONCEPT_LABEL } from "@/components/portal/locations/locations-shared";
import { formatPosMoney, formatPosMoneyCompact } from "@/components/portal/pos/pos-shared";

// Report "Neotevřené prodejny" - prodejny, které nedávno prodávaly, ale teď N dní
// po sobě nemají tržbu (výpadek). Sdílený modal se dvěma spouštěči: klikací KPI
// karta (Živě) a tlačítko (Prodejny). Data se počítají na serveru (getClosedStores)
// a sem přitečou hotová - tady jen UI a stav modalu.

// "1 den" / "2 dny" / "5 dní" (gap je 1..7).
function gapText(n: number): string {
  if (n === 1) return "1 den";
  if (n >= 2 && n <= 4) return `${n} dny`;
  return `${n} dní`;
}

// "2026-06-25" -> "25.6."
function dayLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

// Klikací KPI karta na Živě (4. dlaždice vedle Tržby/Účtenky/Ø ticket). Vizuálně
// kopíruje PosKpiCard, ale je to <button> otevírající modal.
export function ClosedStoresKpiCard({ report }: { report: ClosedStoresReport }) {
  const [open, setOpen] = useState(false);
  const has = report.count > 0;
  const worst = report.rows[0]?.gapDays ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="group flex min-w-0 flex-col gap-2 rounded-2xl border border-edge bg-paper p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-soft hover:shadow-[0_10px_30px_-14px_rgba(14,14,14,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <span className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-mid">
          Neotevřené prodejny
        </span>
        <div className="truncate text-[1.5rem] font-extrabold leading-[1.05] tracking-[-0.03em] tabular-nums text-ink-base">
          {report.count}
        </div>
        <div className="flex min-h-[16px] flex-wrap items-center gap-x-1.5 text-[11.5px]">
          {has ? (
            <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
              <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
              k řešení
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              vše v provozu
            </span>
          )}
          {has && <span className="tabular-nums text-ink-soft">· až {gapText(worst)} bez tržby</span>}
        </div>
        <span className="mt-auto pt-1 text-[11px] font-medium text-ink-mid underline-offset-2 group-hover:underline">
          Zobrazit přehled
        </span>
      </button>
      {open && <ClosedStoresModal report={report} onClose={() => setOpen(false)} />}
    </>
  );
}

// Decentní tlačítko pod filtrem na stránce Prodejny. Signál naléhavosti = tečka +
// počet; nepřekřičí žebříček.
export function ClosedStoresButton({ report }: { report: ClosedStoresReport }) {
  const [open, setOpen] = useState(false);
  const has = report.count > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-full border border-edge bg-paper px-3.5 py-2 text-[12.5px] font-medium text-ink-base transition-colors hover:border-ink-soft hover:bg-edge-warm/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <DoorClosed className="h-4 w-4 text-ink-mid" strokeWidth={1.75} aria-hidden="true" />
        Neotevřené prodejny
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
            has ? "bg-rose-500 text-paper" : "bg-edge text-ink-mid"
          }`}
        >
          {report.count}
        </span>
      </button>
      {open && <ClosedStoresModal report={report} onClose={() => setOpen(false)} />}
    </>
  );
}

// Modal s celým reportem. Konvence modalů portálu (Escape, scroll-lock, klik na pozadí).
function ClosedStoresModal({ report, onClose }: { report: ClosedStoresReport; onClose: () => void }) {
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
      aria-label="Neotevřené prodejny"
    >
      <div className="relative w-full max-w-[640px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">Provoz</div>
            <h2 className="mt-1 truncate text-[1.15rem] font-bold leading-[1.2] tracking-[-0.02em] text-ink-base">
              Neotevřené prodejny
            </h2>
            <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-mid">
              Prodejny, které nedávno prodávaly, ale teď mají výpadek (1-7 dní bez tržby). Trvale
              zavřené (bez tržby přes týden) tu nejsou.{" "}
              {report.afternoon
                ? "Dnešek se počítá (po 12:00 zatím bez tržby)."
                : "Dnešek se do výpadku započítá až po 12:00."}
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

        {report.rows.length === 0 ? (
          <div className="rounded-xl border border-edge bg-edge-warm/30 px-4 py-8 text-center">
            <div className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Vše v provozu
            </div>
            <p className="mt-1 text-[12.5px] text-ink-mid">Žádná prodejna teď nehlásí výpadek.</p>
          </div>
        ) : (
          <ol className="flex flex-col">
            {report.rows.map((r, i) => (
              <ClosedRow key={r.locationId} rank={i + 1} row={r} currency={report.currency} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function ClosedRow({ rank, row, currency }: { rank: number; row: ClosedStoreRow; currency: string }) {
  return (
    <li className="flex items-center gap-3 border-b border-edge/60 py-2.5 last:border-0">
      <span className="w-5 shrink-0 text-right text-[11.5px] tabular-nums text-ink-soft">{rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink-deep" title={row.name}>
          {row.name}
        </span>
        <span className="block truncate text-[11.5px] text-ink-soft">
          {CONCEPT_LABEL[row.concept]} · naposledy {dayLabel(row.lastSaleDate)}
          {row.todayCounts ? " · dnes zatím nic" : ""}
        </span>
      </span>
      {row.avgDailyGross > 0 && (
        <span
          className="hidden shrink-0 text-right text-[12px] tabular-nums text-ink-mid sm:block"
          title={`Obvyklá denní tržba ${formatPosMoney(row.avgDailyGross, currency)}`}
        >
          ~{formatPosMoneyCompact(row.avgDailyGross, currency)}/den
        </span>
      )}
      <span className="shrink-0">
        <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-rose-600">
          {gapText(row.gapDays)}
        </span>
      </span>
    </li>
  );
}
