"use client";

import { useState, type MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import type { ReceiptListItem } from "@/lib/portal/pos/types";
import { formatLocalDateTime, formatPosMoney } from "@/components/portal/pos/pos-shared";
import { ReceiptModal } from "@/components/portal/pos/ReceiptModal";

// České skloňování pro náznak obsahu účtenky v řádku ("5 položek").
function polozkyLabel(n: number): string {
  if (n === 1) return "1 položka";
  if (n >= 2 && n <= 4) return `${n} položky`;
  return `${n} položek`;
}

// Klientský seznam účtenek: řádek ukazuje prodejnu + město (místo surového názvu
// pokladny) a kde je místo i počet položek; kliknutí otevře modal s detailem
// místo navigace na novou stránku. Anchor s href je zachovaný kvůli
// cmd/ctrl/prostřední-klik = otevřít detail v nové kartě (a jako fallback bez JS).
export function ReceiptsTable({
  rows,
  useNet,
  filterQs,
}: {
  rows: ReceiptListItem[];
  useNet: boolean;
  filterQs: string;
}) {
  const [selected, setSelected] = useState<ReceiptListItem | null>(null);

  const hrefFor = (id: string) => `/portal/pos/uctenky/${id}${filterQs ? `?${filterQs}` : ""}`;

  const onRowClick = (e: MouseEvent<HTMLAnchorElement>, r: ReceiptListItem) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setSelected(r);
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
        {rows.map((r) => (
          <a
            key={r.id}
            href={hrefFor(r.id)}
            onClick={(e) => onRowClick(e, r)}
            className="flex cursor-pointer items-center gap-3 border-b border-edge/60 px-4 py-3 text-[13px] transition-colors last:border-0 hover:bg-edge-warm"
          >
            <span className="w-[104px] shrink-0 tabular-nums text-ink-mid">{formatLocalDateTime(r.opened_at)}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium text-ink-base">{r.locationName || "—"}</span>
                {r.is_refund && (
                  <span className="shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-700">
                    refundace
                  </span>
                )}
              </span>
              {r.city && <span className="truncate text-[12px] text-ink-soft">{r.city}</span>}
            </span>
            <span className="hidden w-[110px] shrink-0 truncate text-right text-[12px] text-ink-soft sm:block">
              {r.items_count > 0 ? polozkyLabel(r.items_count) : "—"}
            </span>
            <span className="w-[120px] shrink-0 text-right font-semibold tabular-nums text-ink-base">
              {formatPosMoney(useNet ? r.net : r.gross, r.currency)}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" strokeWidth={1.5} aria-hidden="true" />
          </a>
        ))}
      </div>

      {selected && (
        <ReceiptModal row={selected} detailHref={hrefFor(selected.id)} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
