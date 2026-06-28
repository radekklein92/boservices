"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { FilterChip } from "@/components/portal/ui/FilterChip";
import { Chip } from "@/components/portal/ui/Chip";
import { FeeEditModal } from "./FeeEditModal";
import type { ContractType } from "@/lib/portal/contract-types";
import type { ContractFeeTerms } from "@/lib/portal/contract-fee-terms";
import type { FeeRow, MonthFeeStatus } from "@/lib/portal/fees-page";

export type FeeRowView = FeeRow & {
  status: MonthFeeStatus;
  computedAmount: number | null;
  computedCurrency: string;
};

export type EditableContract = {
  contractType: ContractType;
  feeTerms: ContractFeeTerms | null;
};

const STATUS_META: Record<MonthFeeStatus, { label: string; tone: string }> = {
  final: { label: "Finální", tone: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  estimate: { label: "Odhad", tone: "border-amber-300 bg-amber-50 text-amber-700" },
  none: { label: "", tone: "" },
};

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMoney(n: number, currency: string): string {
  const v = Math.round(n).toLocaleString("cs-CZ");
  return currency === "CZK" ? `${v} Kč` : `${v} ${currency}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
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

type SortKey = "location" | "contract" | "fee" | "amount" | "from" | "to" | "status";
type Sort = { key: SortKey; dir: "asc" | "desc" } | null;
const STATUS_ORDER: Record<MonthFeeStatus, number> = { final: 0, estimate: 1, none: 2 };

function sortValue(r: FeeRowView, key: SortKey): string | number {
  switch (key) {
    case "location":
      return r.locationName.toLowerCase();
    case "contract":
      return r.contractLabel.toLowerCase();
    case "fee":
      return r.periodLabel.toLowerCase();
    case "amount":
      return r.computedAmount ?? (r.percent > 0 ? r.percent : -1);
    case "from":
      return r.from || "9999";
    case "to":
      return r.to || "9999";
    case "status":
      return STATUS_ORDER[r.status];
  }
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "location", label: "Lokalita" },
  { key: "contract", label: "Smlouva" },
  { key: "fee", label: "Poplatek" },
  { key: "amount", label: "Sazba / částka" },
  { key: "from", label: "Od" },
  { key: "to", label: "Do" },
  { key: "status", label: "Status" },
];

export function FeesClient({
  rows,
  contracts,
  selectedMonth,
  months,
}: {
  rows: FeeRowView[];
  contracts: Record<string, EditableContract>;
  selectedMonth: string;
  months: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MonthFeeStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ContractType | "all">("all");
  const [sort, setSort] = useState<Sort>(null);
  const [openContractId, setOpenContractId] = useState<string | null>(null);

  const idx = months.indexOf(selectedMonth);
  const prevMonth = idx > 0 ? months[idx - 1] : null;
  const nextMonth = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;

  function goMonth(target: string | null) {
    if (!target) return;
    startTransition(() => router.push(`/portal/fees?month=${target}`));
  }

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  const presentTypes = useMemo(() => {
    const set = new Map<ContractType, { label: string; count: number }>();
    for (const r of rows) {
      const e = set.get(r.contractType);
      if (e) e.count++;
      else set.set(r.contractType, { label: r.contractLabel, count: 1 });
    }
    return [...set.entries()];
  }, [rows]);

  const statusCounts = useMemo(() => {
    const c = { final: 0, estimate: 0, none: 0 } as Record<MonthFeeStatus, number>;
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (typeFilter !== "all" && r.contractType !== typeFilter) return false;
      if (q) {
        const hay = `${r.locationName} ${r.clientName} ${r.contractLabel} ${r.periodLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (!sort) {
      return out.sort((a, b) => a.locationName.localeCompare(b.locationName, "cs"));
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    return out.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      let c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "cs");
      if (c === 0) c = a.locationName.localeCompare(b.locationName, "cs");
      return c * dir;
    });
  }, [rows, search, statusFilter, typeFilter, sort]);

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      if (r.computedAmount != null) {
        m.set(r.computedCurrency, (m.get(r.computedCurrency) ?? 0) + r.computedAmount);
      }
    }
    return [...m.entries()];
  }, [filtered]);

  const open = openContractId ? contracts[openContractId] : null;
  const openRow = openContractId ? rows.find((r) => r.contractId === openContractId) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Měsíční stepper + hledání */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-full border border-edge bg-paper p-1">
          <button
            type="button"
            onClick={() => goMonth(prevMonth)}
            disabled={!prevMonth}
            aria-label="Předchozí měsíc"
            className="grid h-8 w-8 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <span
            className={`min-w-[150px] text-center text-[13.5px] font-semibold tracking-[-0.01em] text-ink-base transition-opacity ${isPending ? "opacity-40" : ""}`}
          >
            {monthLabel(selectedMonth)}
          </span>
          <button
            type="button"
            onClick={() => goMonth(nextMonth)}
            disabled={!nextMonth}
            aria-label="Další měsíc"
            className="grid h-8 w-8 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="relative max-w-[360px] flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mid"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat lokalitu, klienta, poplatek…"
            className="h-11 w-full rounded-full border border-edge bg-paper pl-11 pr-4 text-[14px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
          />
        </div>
      </div>

      {/* Filtry */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label="Vše" count={rows.length} />
        <FilterChip
          active={statusFilter === "final"}
          onClick={() => setStatusFilter("final")}
          label="Finální"
          count={statusCounts.final}
          dotClass="bg-emerald-500"
        />
        <FilterChip
          active={statusFilter === "estimate"}
          onClick={() => setStatusFilter("estimate")}
          label="Odhad"
          count={statusCounts.estimate}
          dotClass="bg-amber-500"
        />
        <FilterChip
          active={statusFilter === "none"}
          onClick={() => setStatusFilter("none")}
          label="Bez statusu"
          count={statusCounts.none}
          dotClass="bg-ink-soft"
        />
        {presentTypes.length > 1 && (
          <>
            <span className="mx-1 h-5 w-px shrink-0 bg-edge" aria-hidden="true" />
            <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")} label="Všechny smlouvy" />
            {presentTypes.map(([type, meta]) => (
              <FilterChip
                key={type}
                active={typeFilter === type}
                onClick={() => setTypeFilter(type)}
                label={meta.label}
                count={meta.count}
              />
            ))}
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {totals.map(([cur, sum]) => (
            <span key={cur} className="text-[12px] text-ink-mid">
              <span className="text-ink-soft">objem</span>{" "}
              <span className="font-semibold text-ink-base">{formatMoney(sum, cur)}</span>
            </span>
          ))}
          <span className="font-mono text-[12px] text-ink-soft">
            {filtered.length.toString().padStart(2, "0")} / {rows.length}
          </span>
        </div>
      </div>

      {/* Tabulka */}
      <div className="max-h-[calc(100dvh-300px)] overflow-auto rounded-3xl border border-edge bg-paper">
        <table className="w-full min-w-[980px] border-collapse text-[13px]">
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const isFirst = c.key === "location";
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={`whitespace-nowrap py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-mid ${
                      isFirst
                        ? "sticky left-0 top-0 z-30 border-r border-edge bg-paper-warm px-3"
                        : "sticky top-0 z-20 bg-paper-warm px-3"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 uppercase transition-colors hover:text-ink-base"
                    >
                      {c.label}
                      {active ? (
                        sort!.dir === "asc" ? (
                          <ChevronUp className="h-3 w-3" strokeWidth={2} />
                        ) : (
                          <ChevronDown className="h-3 w-3" strokeWidth={2} />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" strokeWidth={2} />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.key}
                onClick={() => setOpenContractId(r.contractId)}
                className="group cursor-pointer border-t border-edge transition-colors hover:bg-paper-warm"
              >
                <td className="sticky left-0 z-10 border-r border-edge bg-paper px-3 py-2 align-middle group-hover:bg-paper-warm">
                  <Link
                    href={`/portal/locations/${r.locationId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="group/loc flex min-w-0 flex-col"
                  >
                    <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold tracking-[-0.01em] text-ink-base">
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
                <td className="px-3 py-2 align-middle text-ink-base">{r.contractLabel}</td>
                <td className="px-3 py-2 align-middle text-ink-deep">
                  {r.pending ? <span className="text-ink-soft">{r.pending}</span> : r.periodLabel}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle">
                  <AmountCell row={r} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle text-ink-deep">
                  {r.from ? fmtDate(r.from) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle text-ink-deep">
                  {r.pending ? "—" : r.to ? fmtDate(r.to) : "dle franšízové smlouvy"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle">
                  {r.status !== "none" && (
                    <Chip tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</Chip>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-12 text-center text-[13px] text-ink-soft">
                  Žádné poplatky neodpovídají filtru.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && openRow && (
        <FeeEditModal
          contractId={openContractId!}
          contractType={open.contractType}
          initial={open.feeTerms}
          locationName={openRow.locationName}
          contractLabel={openRow.contractLabel}
          onClose={() => setOpenContractId(null)}
          onSaved={() => {
            setOpenContractId(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

// Buňka sazba/částka: dle statusu procento (none), ~odhad nebo finální částka.
function AmountCell({ row }: { row: FeeRowView }) {
  if (row.pending) return <span className="text-ink-soft">—</span>;
  if (row.status === "none" || row.computedAmount == null) {
    return <span className="font-medium text-ink-base">{row.rate}</span>;
  }
  const prefix = row.status === "estimate" ? "~" : "";
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="font-semibold text-ink-base">
        {prefix}
        {formatMoney(row.computedAmount, row.computedCurrency)}
      </span>
      {row.percent > 0 && <span className="text-[11px] text-ink-soft">{row.rate}</span>}
    </span>
  );
}
