"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { formatPosMoney, formatPosNumber } from "./pos-shared";
import { PosDeltaBadge } from "./PosDeltaBadge";

export interface LeaderRow {
  id: string;
  label: string;
  sublabel?: string;
  href?: string;
  value: number; // hlavní metrika (tržby s/bez DPH)
  prev: number | null;
  receipts: number;
  atv: number | null;
}

type SortKey = "value" | "delta" | "receipts" | "atv";

function deltaOf(r: LeaderRow): number {
  if (r.prev == null || r.prev === 0) return Number.NEGATIVE_INFINITY;
  return (r.value - r.prev) / Math.abs(r.prev);
}

export function PosLeaderboard({
  rows,
  currency,
  valueLabel,
}: {
  rows: LeaderRow[];
  currency: string;
  valueLabel: string;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [dir, setDir] = useState<"desc" | "asc">("desc");

  function toggle(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setDir("desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let av: number, bv: number;
    if (sortKey === "delta") {
      av = deltaOf(a);
      bv = deltaOf(b);
    } else if (sortKey === "receipts") {
      av = a.receipts;
      bv = b.receipts;
    } else if (sortKey === "atv") {
      av = a.atv ?? 0;
      bv = b.atv ?? 0;
    } else {
      av = a.value;
      bv = b.value;
    }
    return dir === "desc" ? bv - av : av - bv;
  });

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="overflow-x-auto rounded-2xl border border-edge bg-paper">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-edge text-left text-[11px] uppercase tracking-[0.1em] text-ink-mid">
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Název</th>
            <Th label={valueLabel} active={sortKey === "value"} dir={dir} onClick={() => toggle("value")} />
            <Th label="Δ" active={sortKey === "delta"} dir={dir} onClick={() => toggle("delta")} />
            <Th label="ATV" active={sortKey === "atv"} dir={dir} onClick={() => toggle("atv")} />
            <Th label="Účtenky" active={sortKey === "receipts"} dir={dir} onClick={() => toggle("receipts")} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={r.id}
              onClick={
                r.href
                  ? (e) => {
                      // necháme prohlížeč na cmd/ctrl/shift/prostřední klik (nový tab)
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                      router.push(r.href!);
                    }
                  : undefined
              }
              className={`border-b border-edge/60 last:border-0 hover:bg-edge-warm/60 ${r.href ? "cursor-pointer" : ""}`}
            >
              <td className="px-4 py-2.5 tabular-nums text-ink-soft">{i + 1}</td>
              <td className="px-4 py-2.5">
                <div className="flex flex-col gap-1">
                  {r.href ? (
                    <Link
                      href={r.href}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-ink-base hover:underline"
                    >
                      {r.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink-base">{r.label}</span>
                  )}
                  {r.sublabel && <span className="text-[11.5px] text-ink-soft">{r.sublabel}</span>}
                  <span className="h-1 w-full max-w-[200px] overflow-hidden rounded-full bg-edge">
                    <span
                      className="block h-full rounded-full bg-ink-base"
                      style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
                    />
                  </span>
                </div>
              </td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-base">
                {formatPosMoney(r.value, currency)}
              </td>
              <td className="px-4 py-2.5 text-right">
                <PosDeltaBadge current={r.value} previous={r.prev} className="justify-end text-[11.5px]" />
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-mid">
                {r.atv != null ? formatPosMoney(r.atv, currency) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-deep">{formatPosNumber(r.receipts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "desc" | "asc";
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3 text-right font-medium">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.1em] transition-colors hover:text-ink-base ${
          active ? "text-ink-base" : "text-ink-mid"
        }`}
      >
        {label}
        {active &&
          (dir === "desc" ? (
            <ArrowDown className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          ) : (
            <ArrowUp className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          ))}
      </button>
    </th>
  );
}
