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

// Výpis produktů z účtenky pro náhled v řádku (vodorovně ve volném místě uprostřed).
// Spojené " · " s "n×" u násobků; přetečení řeší CSS truncate (... = je toho víc).
function itemsPreview(items: ReceiptItem[]): string {
  if (items.length === 0) return "Bez položek";
  return items
    .map((it) => {
      const q = it.qty;
      const prefix = Number.isInteger(q) && q > 1 ? `${q}× ` : "";
      return `${prefix}${it.product_name || "—"}`;
    })
    .join(" · ");
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
  hideLocation = false,
}: {
  rows: ReceiptListItem[];
  useNet: boolean;
  filterQs: string;
  // Na detailu prodejny je prodejna v hlavičce - skryjeme redundantní sloupec
  // prodejna+město a uvolníme místo výpisu produktů.
  hideLocation?: boolean;
}) {
  const [selected, setSelected] = useState<ReceiptListItem | null>(null);
  const hrefFor = (id: string) => `/portal/pos/uctenky/${id}${filterQs ? `?${filterQs}` : ""}`;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
        {rows.map((r) => (
          <ReceiptRow
            key={r.id}
            row={r}
            useNet={useNet}
            href={hrefFor(r.id)}
            onOpen={setSelected}
            hideLocation={hideLocation}
          />
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
  hideLocation,
}: {
  row: ReceiptListItem;
  useNet: boolean;
  href: string;
  onOpen: (r: ReceiptListItem) => void;
  hideLocation: boolean;
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
      {hideLocation ? (
        /* Detail prodejny: prodejnu už nese hlavička stránky - místo ní rovnou
           výpis produktů (na mobilu počet); refundační odznak jde dovnitř. */
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-ink-mid">
          {row.is_refund && <RefundBadge />}
          <span className="min-w-0 truncate">{productsLine}</span>
        </span>
      ) : (
        <>
          {/* Prodejna + město. Na desktopu pevná šířka, ať produkty mají místo vedle. */}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 lg:flex-none lg:w-[300px]">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium text-ink-base">{row.locationName || "—"}</span>
              {row.is_refund && <RefundBadge />}
            </span>
            {row.city && <span className="truncate text-[12px] text-ink-soft">{row.city}</span>}
          </span>
          {/* Desktop: výpis produktů ve volném místě uprostřed (dokud se nenačte, počet) */}
          <span className="hidden min-w-0 flex-1 truncate text-[12px] text-ink-mid lg:block">{productsLine}</span>
          {/* Mobil/tablet: jen počet položek (na desktopu ho nahradí výpis uprostřed) */}
          <span className="hidden w-[110px] shrink-0 truncate text-right text-[12px] text-ink-soft sm:block lg:hidden">
            {countLabel}
          </span>
        </>
      )}
      <span className="w-[120px] shrink-0 text-right font-semibold tabular-nums text-ink-base">
        {formatPosMoney(useNet ? row.net : row.gross, row.currency)}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" strokeWidth={1.5} aria-hidden="true" />
    </a>
  );
}

// Odznak "refundace" - vedle prodejny (seznam) nebo u produktů (detail prodejny).
function RefundBadge() {
  return (
    <span className="shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-700">
      refundace
    </span>
  );
}
