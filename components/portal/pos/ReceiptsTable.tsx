"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import type { ReceiptDetail, ReceiptItem, ReceiptListItem } from "@/lib/portal/pos/types";
import { formatLocalDateTime, formatPosMoney } from "@/components/portal/pos/pos-shared";
import { ReceiptModal } from "@/components/portal/pos/ReceiptModal";

// České skloňování pro počet položek ("5 položek") - hint na mobilu/tabletu a
// fallback, dokud se na desktopu nedotáhne výpis produktů.
function polozkyLabel(n: number): string {
  if (n === 1) return "1 položka";
  if (n >= 2 && n <= 4) return `${n} položky`;
  return `${n} položek`;
}

// Výpis produktů z účtenky pro náhled v řádku: prvních pár, s "n×" u násobků a
// "+N" pro zbytek. Spojené " · ", truncate řeší CSS.
function itemsPreview(items: ReceiptItem[], max = 6): string {
  if (items.length === 0) return "Bez položek";
  const shown = items.slice(0, max).map((it) => {
    const q = it.qty;
    const prefix = Number.isInteger(q) && q > 1 ? `${q}× ` : "";
    return `${prefix}${it.product_name || "—"}`;
  });
  const more = items.length - max;
  return more > 0 ? `${shown.join(" · ")} +${more}` : shown.join(" · ");
}

// Klientský seznam účtenek: řádek ukazuje prodejnu + město (místo surového názvu
// pokladny). Na desktopu (lg+) navíc lazy výpis produktů, dotažený až když řádek
// nascrolluje do viewportu (server-side cachované, takže se netáhne 50 dokladů
// naráz). Kliknutí otevře modal s detailem; anchor s href je zachovaný kvůli
// cmd/ctrl/prostřední-klik = nová karta (a jako fallback bez JS).
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

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
        {rows.map((r) => (
          <ReceiptRow key={r.id} row={r} useNet={useNet} href={hrefFor(r.id)} onOpen={setSelected} />
        ))}
      </div>

      {selected && (
        <ReceiptModal row={selected} detailHref={hrefFor(selected.id)} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function ReceiptRow({
  row,
  useNet,
  href,
  onOpen,
}: {
  row: ReceiptListItem;
  useNet: boolean;
  href: string;
  onOpen: (r: ReceiptListItem) => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [items, setItems] = useState<ReceiptItem[] | null>(null);

  // Lazy výpis produktů: jen na desktopu (lg+) a až když řádek nascrolluje do
  // viewportu. Jeden pokus; při chybě zůstane fallback na počtu položek.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || row.items_count === 0) return;
    const ctrl = new AbortController();
    let done = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (done) return;
        const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
        if (!isDesktop) return;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          done = true;
          observer.disconnect();
          fetch(`/api/portal/pos/receipts/${encodeURIComponent(row.id)}`, { signal: ctrl.signal })
            .then(async (res) => {
              if (!res.ok) throw new Error("http");
              const json = (await res.json()) as { ok?: boolean; receipt?: ReceiptDetail };
              if (!json?.ok || !json.receipt) throw new Error("payload");
              setItems(json.receipt.items ?? []);
            })
            .catch(() => {
              /* necháme fallback na počtu položek */
            });
          break;
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      ctrl.abort();
      observer.disconnect();
    };
  }, [row.id, row.items_count]);

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onOpen(row);
  };

  const countLabel = row.items_count > 0 ? polozkyLabel(row.items_count) : "—";
  const productsLine = items ? itemsPreview(items) : countLabel;

  return (
    <a
      ref={ref}
      href={href}
      onClick={onClick}
      className="flex cursor-pointer items-center gap-3 border-b border-edge/60 px-4 py-3 text-[13px] transition-colors last:border-0 hover:bg-edge-warm"
    >
      <span className="w-[104px] shrink-0 tabular-nums text-ink-mid">{formatLocalDateTime(row.opened_at)}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-ink-base">{row.locationName || "—"}</span>
          {row.is_refund && (
            <span className="shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-700">
              refundace
            </span>
          )}
        </span>
        {row.city && <span className="truncate text-[12px] text-ink-soft">{row.city}</span>}
        {/* Desktop: výpis produktů (dokud se nenačte, ukáže počet) */}
        <span className="hidden truncate text-[12px] text-ink-soft lg:block">{productsLine}</span>
      </span>
      {/* Mobil/tablet: jen počet položek (na desktopu ho nahradí výpis výše) */}
      <span className="hidden w-[110px] shrink-0 truncate text-right text-[12px] text-ink-soft sm:block lg:hidden">
        {countLabel}
      </span>
      <span className="w-[120px] shrink-0 text-right font-semibold tabular-nums text-ink-base">
        {formatPosMoney(useNet ? row.net : row.gross, row.currency)}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" strokeWidth={1.5} aria-hidden="true" />
    </a>
  );
}
