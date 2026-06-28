"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import type { ReceiptDetail, ReceiptListItem } from "@/lib/portal/pos/types";
import { formatLocalDateTime } from "@/components/portal/pos/pos-shared";
import { ReceiptDetailView } from "@/components/portal/pos/ReceiptDetailView";

type FetchState =
  | { status: "loading" }
  | { status: "ok"; receipt: ReceiptDetail }
  | { status: "error" };

// Modal s detailem účtenky. Hlavičku (prodejna + město) vykreslí okamžitě z řádku
// seznamu (už obohaceného); tělo (KPI/položky/platby) dotáhne z API po otevření -
// list se tak nezdržuje N dotazy a detail je cachovaný na straně serveru.
export function ReceiptModal({
  row,
  detailHref,
  onClose,
}: {
  row: ReceiptListItem;
  detailHref: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  // Scroll lock + zavírání Escapem (konvence modalů v portálu).
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

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/portal/pos/receipts/${encodeURIComponent(row.id)}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("http");
        const json = (await res.json()) as { ok?: boolean; receipt?: ReceiptDetail };
        if (!json?.ok || !json.receipt) throw new Error("payload");
        setState({ status: "ok", receipt: json.receipt });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => ctrl.abort();
  }, [row.id]);

  const subtitle = [row.city, formatLocalDateTime(row.opened_at), row.source].filter(Boolean).join(" · ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-8 backdrop-blur-sm md:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-[720px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">Účtenka</div>
            <h2 className="mt-1 truncate font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              {row.locationName || "Účtenka"}
            </h2>
            {(subtitle || row.channel) && (
              <p className="mt-1 truncate text-[12.5px] text-ink-mid">
                {subtitle}
                {row.channel ? ` · ${row.channel}` : ""}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {row.is_refund && (
              <span className="rounded-md bg-rose-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700">
                Refundace
              </span>
            )}
            <button
              type="button"
              aria-label="Zavřít"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
            >
              <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>

        {state.status === "loading" && <ReceiptSkeleton />}
        {state.status === "error" && (
          <div className="rounded-2xl border border-edge bg-paper p-6">
            <div className="text-[14px] font-semibold text-ink-base">Účtenku se nepodařilo načíst</div>
            <p className="mt-1.5 text-[13px] text-ink-mid">
              Zkuste to prosím znovu, nebo otevřete celou stránku.
            </p>
          </div>
        )}
        {state.status === "ok" && <ReceiptDetailView receipt={state.receipt} />}

        <div className="mt-6 flex justify-end border-t border-edge/60 pt-4">
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
          >
            Otevřít celou stránku
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ReceiptSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[68px] rounded-2xl border border-edge bg-edge-warm/50" />
        ))}
      </div>
      <div className="h-[180px] rounded-2xl border border-edge bg-edge-warm/40" />
    </div>
  );
}
