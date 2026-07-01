"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X, ArrowUpRight } from "lucide-react";
import type { SkippedFeeRow, SkippedFeesReport } from "@/lib/portal/fees-page";

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

// Modal s reportem smluv vynechaných ve zvoleném měsíci - pro ruční kontrolu.
// Tři skupiny: bez tržby (účinné, ale prodejna neměla tržbu), ještě neúčinné a
// expirované. Otevírá se z toolbaru stránky Poplatky.
export function SkippedContractsModal({
  report,
  month,
  onClose,
}: {
  report: SkippedFeesReport;
  month: string;
  onClose: () => void;
}) {
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

  const total = report.noRevenue.length + report.notYetEffective.length + report.expired.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-8 backdrop-blur-sm md:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[820px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              {monthLabel(month)}
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Vynechané smlouvy
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-mid">
              Smlouvy, které se za tento měsíc neobjeví v přehledu poplatků: bez tržby, ještě
              neúčinné nebo už expirované. Pro kontrolu.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-base hover:text-ink-base"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {total === 0 ? (
          <p className="rounded-2xl border border-edge bg-paper-warm px-4 py-8 text-center text-[13px] text-ink-soft">
            Za tento měsíc nic vynecháno - všechny účinné smlouvy mají poplatek.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <CategoryTable
              title="Bez tržby za měsíc"
              hint="Účinné smlouvy, které nevygenerovaly poplatek, protože prodejna neměla za tento měsíc žádnou tržbu."
              rows={report.noRevenue}
            />
            <CategoryTable
              title="Ještě neúčinné"
              hint="Perioda poplatku začíná až po tomto měsíci."
              rows={report.notYetEffective}
              dateLabel="Účinná od"
              dateValue={(r) => r.from}
            />
            <CategoryTable
              title="Expirované"
              hint="Perioda poplatku skončila před tímto měsícem."
              rows={report.expired}
              dateLabel="Do"
              dateValue={(r) => r.to}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryTable({
  title,
  hint,
  rows,
  dateLabel,
  dateValue,
}: {
  title: string;
  hint: string;
  rows: SkippedFeeRow[];
  dateLabel?: string;
  dateValue?: (r: SkippedFeeRow) => string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink-base">{title}</h3>
        <span className="font-mono text-[12px] text-ink-soft">{rows.length}</span>
      </div>
      <p className="mb-3 text-[11.5px] text-ink-soft">{hint}</p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-edge bg-paper-warm px-3 py-3 text-[12.5px] text-ink-soft">
          Žádné.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-edge">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Lokalita", "Smlouva", "Sazba", ...(dateLabel ? [dateLabel] : [])].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap border-b border-edge bg-paper-warm px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-mid"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="transition-colors hover:bg-paper-warm">
                  <td className="border-t border-edge px-3 py-2.5 align-middle">
                    <Link
                      href={`/portal/locations/${r.locationId}`}
                      className="group/loc flex min-w-0 flex-col"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-[-0.01em] text-ink-base">
                        <span className="max-w-[220px] truncate">{r.locationName}</span>
                        <ArrowUpRight
                          className="h-3 w-3 shrink-0 text-ink-soft transition-transform group-hover/loc:-translate-y-0.5 group-hover/loc:translate-x-0.5"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="truncate text-[11px] text-ink-soft">{r.clientName}</span>
                    </Link>
                  </td>
                  <td className="border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                    {r.contractLabel}
                  </td>
                  <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle font-medium text-ink-base">
                    {r.rate}
                  </td>
                  {dateLabel && (
                    <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                      {dateValue ? fmtDate(dateValue(r)) : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
