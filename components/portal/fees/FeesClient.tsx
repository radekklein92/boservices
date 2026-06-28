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

// ── Měsíční matematika / formát (client-safe) ───────────────────────────────────

function addMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

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

// ── Řazení ──────────────────────────────────────────────────────────────────────

type SortKey = "location" | "contract" | "fee" | "amount" | "from" | "to" | "status";
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
      // Číselně dle vypočtené částky; bez částky (jen procento) až na konec.
      return r.computedAmount ?? (r.percent > 0 ? r.percent : -1);
    case "from":
      return r.from || "9999";
    case "to":
      return r.to || "9999";
    case "status":
      return STATUS_ORDER[r.status];
  }
}

export function FeesClient({
  rows,
  contracts,
  selectedMonth,
  minMonth,
}: {
  rows: FeeRowView[];
  contracts: Record<string, EditableContract>;
  selectedMonth: string;
  minMonth: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const atFloor = selectedMonth <= minMonth;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MonthFeeStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ContractType | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("location");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [openContractId, setOpenContractId] = useState<string | null>(null);

  function goMonth(delta: number) {
    const next = addMonth(selectedMonth, delta);
    if (next < minMonth) return;
    startTransition(() => router.push(`/portal/fees?month=${next}`));
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Typy přítomné v datech (pro filtr).
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
    const dir = sortDir === "asc" ? 1 : -1;
    return out.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.locationName.localeCompare(b.locationName, "cs");
    });
  }, [rows, search, statusFilter, typeFilter, sortKey, sortDir]);

  // Součet vypočtených částek dle měny (jen řádky s částkou).
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
    <div className="flex flex-col gap-5">
      {/* Měsíční stepper + filtry */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 rounded-full border border-edge bg-paper p-1">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              disabled={atFloor}
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
              onClick={() => goMonth(1)}
              aria-label="Další měsíc"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <label className="relative inline-flex items-center">
            <Search
              className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-ink-soft"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hledat lokalitu, klienta, poplatek…"
              className="h-9 w-[260px] max-w-full rounded-full border border-edge bg-paper pl-8 pr-3 text-[12.5px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            label="Vše"
            count={rows.length}
          />
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
              <span className="mx-1 h-5 w-px bg-edge" aria-hidden="true" />
              <FilterChip
                active={typeFilter === "all"}
                onClick={() => setTypeFilter("all")}
                label="Všechny smlouvy"
              />
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
        </div>
      </div>

      {/* Tabulka */}
      <div className="overflow-x-auto rounded-2xl border border-edge">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <Th label="Lokalita" sortKey="location" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Smlouva" sortKey="contract" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Poplatek" sortKey="fee" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Sazba / částka" sortKey="amount" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Od" sortKey="from" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Do" sortKey="to" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Status" sortKey="status" active={sortKey} dir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.key}
                onClick={() => setOpenContractId(r.contractId)}
                className="cursor-pointer transition-colors hover:bg-paper-warm"
              >
                <td className="border-t border-edge px-3 py-2.5 align-middle">
                  <Link
                    href={`/portal/locations/${r.locationId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="group inline-flex items-center gap-1 font-medium text-ink-base hover:text-ink-deep"
                  >
                    <span>{r.locationName}</span>
                    <ArrowUpRight
                      className="h-3 w-3 shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </Link>
                  <div className="text-[11px] text-ink-soft">{r.clientName}</div>
                </td>
                <td className="border-t border-edge px-3 py-2.5 align-middle text-ink-base">
                  {r.contractLabel}
                </td>
                <td className="border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                  {r.pending ? <span className="text-ink-soft">{r.pending}</span> : r.periodLabel}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle">
                  <AmountCell row={r} />
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                  {r.from ? fmtDate(r.from) : "—"}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                  {r.pending ? "—" : r.to ? fmtDate(r.to) : "dle franšízové smlouvy"}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle">
                  {r.status !== "none" && (
                    <Chip tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</Chip>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="border-t border-edge px-3 py-10 text-center text-[13px] text-ink-soft">
                  Žádné poplatky neodpovídají filtru.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Souhrn částek dle měny */}
      {totals.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-[12.5px] text-ink-mid">
          <span className="font-medium text-ink-deep">
            Měsíční objem ({monthLabel(selectedMonth)}):
          </span>
          {totals.map(([cur, sum]) => (
            <span key={cur} className="font-semibold text-ink-base">
              {formatMoney(sum, cur)}
            </span>
          ))}
          <span className="text-ink-soft">· {filtered.length} poplatků</span>
        </div>
      )}

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
    <div className="leading-tight">
      <span className="font-semibold text-ink-base">
        {prefix}
        {formatMoney(row.computedAmount, row.computedCurrency)}
      </span>
      {row.percent > 0 && <span className="ml-2 text-[11px] text-ink-soft">{row.rate}</span>}
    </div>
  );
}

function Th({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th className="whitespace-nowrap border-b border-edge bg-paper-warm px-3 py-2.5 text-left">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${isActive ? "text-ink-base" : "text-ink-mid hover:text-ink-base"}`}
      >
        {label}
        {isActive ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          )
        ) : null}
      </button>
    </th>
  );
}
