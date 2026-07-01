"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Coins,
  FileSpreadsheet,
  FileText,
  LayoutList,
  Loader2,
} from "lucide-react";
import type { CommissionRow } from "@/lib/portal/commissions";
import { formatCzkRounded } from "@/lib/portal/claims";
import { FilterChip } from "@/components/portal/ui/FilterChip";
import { ResultCount } from "@/components/portal/ui/ResultCount";
import { BTN_TOOL } from "@/components/portal/ui/buttons";

type Filter = "all" | "contract" | "claim";

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// Rozpis jednotlivých provizí (read-only, celé částky před dělením 50:50)
// s filtrem na postoupení pohledávek vs. ostatní smlouvy. Každý řádek vede na
// detail příslušné smlouvy.
export function CommissionsBreakdownClient({
  rows,
}: {
  rows: CommissionRow[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [exporting, setExporting] = useState(false);

  async function exportXlsx() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/portal/commissions/breakdown-export", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (ASCII)
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `provize-rozpis-${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[commissions] XLSX rozpis export selhal", err);
    } finally {
      setExporting(false);
    }
  }

  const contractCount = useMemo(
    () => rows.filter((r) => r.kind === "contract").length,
    [rows],
  );
  const claimCount = useMemo(
    () => rows.filter((r) => r.kind === "claim").length,
    [rows],
  );

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.kind === filter)),
    [rows, filter],
  );
  const filteredTotal = useMemo(
    () => filtered.reduce((s, r) => s + r.commission, 0),
    [filtered],
  );

  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
        Rozpis provizí
      </h2>

      {/* Filtr vlevo (vše / ostatní smlouvy / postoupení pohledávek) +
          částka, počet a Excel vpravo - jednotný toolbar (vzor Real Estate). */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="Vše"
          count={rows.length}
          Icon={LayoutList}
        />
        <FilterChip
          active={filter === "contract"}
          onClick={() => setFilter("contract")}
          label="Ostatní smlouvy"
          count={contractCount}
          Icon={FileText}
        />
        <FilterChip
          active={filter === "claim"}
          onClick={() => setFilter("claim")}
          label="Postoupení pohledávek"
          count={claimCount}
          Icon={Coins}
        />

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="text-[12px] text-ink-mid">
            <span className="text-ink-soft">celkem</span>{" "}
            <span className="font-semibold text-ink-base">
              {formatCzkRounded(filteredTotal)}
            </span>{" "}
            <span className="text-ink-soft">· děleno 50:50</span>
          </span>
          <ResultCount shown={filtered.length} total={rows.length} />
          <button
            type="button"
            onClick={exportXlsx}
            disabled={exporting}
            title="Stáhne rozpis jednotlivých provizí (celé částky před 50:50) do Excelu (.xlsx)"
            className={BTN_TOOL}
          >
            {exporting ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            ) : (
              <FileSpreadsheet
                className="h-3.5 w-3.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            )}
            Excel
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-edge bg-paper">
        <ul className="divide-y divide-edge">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={`/portal/contracts/${r.id}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper-warm md:px-7"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink-base">
                      {r.clientName || "Bez názvu klienta"}
                    </span>
                    {r.number && (
                      <span className="font-mono text-[11.5px] text-ink-soft">
                        {r.number}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[12px] text-ink-mid">
                    {r.label}
                    {r.note ? ` · ${r.note}` : ""} · {formatDate(r.signedAt)}
                  </div>
                </div>
                <span className="shrink-0 text-[14px] font-bold tabular-nums text-ink-base">
                  {formatCzkRounded(r.commission)}
                </span>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink-mid"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-7 py-12 text-center text-[13px] text-ink-mid">
              V tomto filtru nejsou žádné položky.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
