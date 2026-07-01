"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, X } from "lucide-react";
import type {
  ClosedStoreRow,
  ClosedStoresReport,
  LongClosedStoreRow,
  LongClosedStoresReport,
} from "@/lib/portal/pos/types";
import { CONCEPT_LABEL } from "@/components/portal/locations/locations-shared";
import { formatPosMoney, formatPosMoneyCompact } from "@/components/portal/pos/pos-shared";
import { BTN_ROW, BTN_SUBTLE } from "@/components/portal/ui/buttons";

// Report "Neotevřené prodejny" - prodejny, které nedávno prodávaly, ale teď N dní
// po sobě nemají tržbu (výpadek). Sdílený modal se dvěma spouštěči: klikací KPI
// karta (Živě) a tlačítko (Prodejny). Data se počítají na serveru (getClosedStores)
// a sem přitečou hotová - tady jen UI a stav modalu.
//
// Modal má dva pohledy: krátkodobé výpadky (default) a "Dlouhodobě neotevřené
// prodejny" (BOS prodejny bez tržby déle než týden, getLongClosedBosStores) - druhý
// se otevírá tlačítkem dole a je VŽDY okruh BOS, nezávisle na filtru stránky.

// "1 den" / "2 dny" / "5 dní" (gap je 1..7).
function gapText(n: number): string {
  if (n === 1) return "1 den";
  if (n >= 2 && n <= 4) return `${n} dny`;
  return `${n} dní`;
}

// Počet dní pro dlouhodobý výpadek (vždy >= 8, nebo null = žádná tržba v okně -> "N+ dní").
function longDaysText(days: number | null, windowDays: number): string {
  if (days === null) return `${windowDays}+ dní`;
  return `${days} dní`;
}

// "2026-06-25" -> "25.6."
function dayLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

// Klikací KPI karta na Živě (4. dlaždice vedle Tržby/Účtenky/Ø ticket). Vizuálně
// kopíruje PosKpiCard, ale je to <button> otevírající modal.
export function ClosedStoresKpiCard({
  report,
  longReport,
}: {
  report: ClosedStoresReport;
  longReport?: LongClosedStoresReport | null;
}) {
  const [open, setOpen] = useState(false);
  const has = report.count > 0;
  const worst = report.rows[0]?.gapDays ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Neotevřené prodejny - otevřít přehled"
        className="group flex min-w-0 flex-col gap-1.5 rounded-2xl border border-edge bg-paper p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-soft hover:shadow-[0_10px_30px_-14px_rgba(14,14,14,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-mid">
            Neotevřené prodejny
          </span>
          <ArrowUpRight
            className="h-4 w-4 shrink-0 text-ink-mid transition-colors group-hover:text-ink-base"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>
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
      </button>
      {open && <ClosedStoresModal report={report} longReport={longReport} onClose={() => setOpen(false)} />}
    </>
  );
}

// Odkaz se šipkou pro pravý horní roh hlavičky (stránka Prodejny) - stejný vzor
// jako "Celý žebříček" jinde v Portálu. Tečka = jemný signál, že něco je k řešení.
export function ClosedStoresLink({
  report,
  longReport,
}: {
  report: ClosedStoresReport;
  longReport?: LongClosedStoresReport | null;
}) {
  const [open, setOpen] = useState(false);
  const has = report.count > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        {has && <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />}
        Neotevřené prodejny ({report.count})
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && <ClosedStoresModal report={report} longReport={longReport} onClose={() => setOpen(false)} />}
    </>
  );
}

// Modal se dvěma pohledy. Konvence modalů portálu (Escape, scroll-lock, klik na pozadí).
function ClosedStoresModal({
  report,
  longReport,
  onClose,
}: {
  report: ClosedStoresReport;
  longReport?: LongClosedStoresReport | null;
  onClose: () => void;
}) {
  const [view, setView] = useState<"current" | "long">("current");

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

  // Dlouhodobé bez těch, co už jsou v krátkodobém seznamu (aby se prodejna
  // neobjevila dvakrát - kalendářní vs. provozní práh se u okraje můžou překrýt).
  const shortIds = new Set(report.rows.map((r) => r.locationId));
  const longRows = (longReport?.rows ?? []).filter((r) => !shortIds.has(r.locationId));
  const hasLong = longReport != null;
  const windowDays = longReport?.windowDays ?? 28;

  const isLong = view === "long";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-8 backdrop-blur-sm md:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={isLong ? "Dlouhodobě neotevřené prodejny" : "Neotevřené prodejny"}
    >
      <div className="relative w-full max-w-[640px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {isLong ? (
              <button type="button" onClick={() => setView("current")} className={`${BTN_SUBTLE} -ml-3 mb-0.5`}>
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Neotevřené prodejny
              </button>
            ) : (
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">Provoz</div>
            )}
            <h2 className="mt-1 truncate text-[1.15rem] font-bold leading-[1.2] tracking-[-0.02em] text-ink-base">
              {isLong ? "Dlouhodobě neotevřené prodejny" : "Neotevřené prodejny"}
            </h2>
            <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-mid">
              {isLong ? (
                <>
                  Prodejny označené jako BOS, které nemají tržbu déle než týden (nebo vůbec za poslední{" "}
                  {windowDays} dní). Nejdéle zavřené nahoře.
                </>
              ) : (
                <>
                  Prodejny, které nedávno prodávaly, ale teď mají výpadek (1-7 dní bez tržby). Trvale
                  zavřené (bez tržby přes týden) tu nejsou.{" "}
                  {report.afternoon
                    ? "Dnešek se počítá (po 12:00 zatím bez tržby)."
                    : "Dnešek se do výpadku započítá až po 12:00."}
                </>
              )}
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

        {isLong ? (
          longRows.length === 0 ? (
            <div className="rounded-xl border border-edge bg-edge-warm/30 px-4 py-8 text-center">
              <div className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                Vše v provozu
              </div>
              <p className="mt-1 text-[12.5px] text-ink-mid">Žádná BOS prodejna není dlouhodobě bez tržby.</p>
            </div>
          ) : (
            <ol className="flex flex-col">
              {longRows.map((r, i) => (
                <LongClosedRow
                  key={r.locationId}
                  rank={i + 1}
                  row={r}
                  currency={longReport?.currency ?? report.currency}
                  windowDays={windowDays}
                />
              ))}
            </ol>
          )
        ) : (
          <>
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

            {hasLong && (
              <div className="mt-5 border-t border-edge pt-4">
                <button
                  type="button"
                  onClick={() => setView("long")}
                  className={`${BTN_ROW} w-full justify-between`}
                >
                  <span>Dlouhodobě neotevřené prodejny</span>
                  <span className="inline-flex items-center gap-1.5 text-ink-mid">
                    <span className="tabular-nums">{longRows.length}</span>
                    <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                </button>
              </div>
            )}
          </>
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

function LongClosedRow({
  rank,
  row,
  currency,
  windowDays,
}: {
  rank: number;
  row: LongClosedStoreRow;
  currency: string;
  windowDays: number;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-edge/60 py-2.5 last:border-0">
      <span className="w-5 shrink-0 text-right text-[11.5px] tabular-nums text-ink-soft">{rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink-deep" title={row.name}>
          {row.name}
        </span>
        <span className="block truncate text-[11.5px] text-ink-soft">
          {CONCEPT_LABEL[row.concept]}
          {row.lastSaleDate ? ` · naposledy ${dayLabel(row.lastSaleDate)}` : ` · bez tržby přes ${windowDays} dní`}
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
          {longDaysText(row.daysClosed, windowDays)}
        </span>
      </span>
    </li>
  );
}
