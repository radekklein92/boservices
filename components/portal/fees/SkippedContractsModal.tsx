"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X, ArrowUpRight } from "lucide-react";
import { FilterChip } from "@/components/portal/ui/FilterChip";
import { Chip } from "@/components/portal/ui/Chip";
import type { SkippedFeeRow, SkippedFeesReport } from "@/lib/portal/fees-page";

// Kategorie vynechání = důvod, proč se smlouva za měsíc neobjeví v přehledu poplatků.
type SkipCategory = "no-revenue" | "not-yet-effective" | "expired";
type SkipFilter = "all" | SkipCategory;

// Tón „Důvodu" (chip) + barevná tečka filtru: bez tržby = neutrální (jako „Bez statusu"
// v hlavní tabulce), neúčinná = modrá (teprve nastane), expirovaná = rudá (skončila).
const CATEGORY_META: Record<SkipCategory, { label: string; tone: string; dot: string }> = {
  "no-revenue": { label: "Bez tržby", tone: "border-edge bg-paper-warm text-ink-mid", dot: "bg-ink-soft" },
  "not-yet-effective": { label: "Ještě neúčinná", tone: "border-sky-300 bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  expired: { label: "Expirovaná", tone: "border-rose-300 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
};

type SkipRow = SkippedFeeRow & { cat: SkipCategory };

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

// Modal s reportem smluv vynechaných ve zvoleném měsíci - pro ruční kontrolu. Jedna
// tabulka + chip filtr (Vše / Bez tržby / Neúčinné / Expirované) a sloupec Důvod, aby
// bylo z každého řádku poznat, proč se za měsíc nefakturuje. Otevírá se z toolbaru Poplatků.
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

  const [filter, setFilter] = useState<SkipFilter>("all");

  // Sjednocený seznam napříč kategoriemi (řazení uvnitř skupin už proběhlo na serveru;
  // pořadí bez tržby -> neúčinné -> expirované).
  const all: SkipRow[] = useMemo(
    () => [
      ...report.noRevenue.map((r) => ({ ...r, cat: "no-revenue" as const })),
      ...report.notYetEffective.map((r) => ({ ...r, cat: "not-yet-effective" as const })),
      ...report.expired.map((r) => ({ ...r, cat: "expired" as const })),
    ],
    [report],
  );

  const counts = {
    all: all.length,
    "no-revenue": report.noRevenue.length,
    "not-yet-effective": report.notYetEffective.length,
    expired: report.expired.length,
  };

  const rows = filter === "all" ? all : all.filter((r) => r.cat === filter);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-8 backdrop-blur-sm md:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[920px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] md:p-7">
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

        {all.length === 0 ? (
          <p className="rounded-2xl border border-edge bg-paper-warm px-4 py-8 text-center text-[13px] text-ink-soft">
            Za tento měsíc nic vynecháno - všechny účinné smlouvy mají poplatek.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Filtr kategorií */}
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                active={filter === "all"}
                onClick={() => setFilter("all")}
                label="Vše"
                count={counts.all}
              />
              <FilterChip
                active={filter === "no-revenue"}
                onClick={() => setFilter("no-revenue")}
                label="Bez tržby"
                count={counts["no-revenue"]}
                dotClass={CATEGORY_META["no-revenue"].dot}
              />
              <FilterChip
                active={filter === "not-yet-effective"}
                onClick={() => setFilter("not-yet-effective")}
                label="Ještě neúčinné"
                count={counts["not-yet-effective"]}
                dotClass={CATEGORY_META["not-yet-effective"].dot}
              />
              <FilterChip
                active={filter === "expired"}
                onClick={() => setFilter("expired")}
                label="Expirované"
                count={counts.expired}
                dotClass={CATEGORY_META.expired.dot}
              />
            </div>

            {/* Tabulka */}
            <div className="overflow-x-auto rounded-2xl border border-edge">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    {["Lokalita", "Smlouva", "Sazba", "Od", "Do", "Důvod"].map((h) => (
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
                    <tr key={r.key} className="border-t border-edge transition-colors hover:bg-paper-warm">
                      <td className="px-3 py-2.5 align-middle">
                        <Link
                          href={`/portal/locations/${r.locationId}`}
                          className="group/loc flex min-w-0 flex-col"
                        >
                          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-[-0.01em] text-ink-base">
                            <span className="max-w-[200px] truncate">{r.locationName}</span>
                            <ArrowUpRight
                              className="h-3 w-3 shrink-0 text-ink-soft transition-transform group-hover/loc:-translate-y-0.5 group-hover/loc:translate-x-0.5"
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                          </span>
                          <span className="truncate text-[11px] text-ink-soft">{r.clientName}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 align-middle text-ink-deep">{r.contractLabel}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-middle font-medium text-ink-base">
                        {r.rate}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-middle text-ink-deep">
                        {fmtDate(r.from)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-middle text-ink-deep">
                        {fmtDate(r.to)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                        <Chip tone={CATEGORY_META[r.cat].tone}>{CATEGORY_META[r.cat].label}</Chip>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-[13px] text-ink-soft">
                        Žádné smlouvy v této kategorii.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
