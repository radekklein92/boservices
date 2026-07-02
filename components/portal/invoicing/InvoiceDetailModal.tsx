"use client";

import { createPortal } from "react-dom";
import { useEffect } from "react";
import { AlertCircle, Check, FileDown, X } from "lucide-react";
import { Chip } from "@/components/portal/ui/Chip";
import { BTN_PRIMARY_MODAL, FV } from "@/components/portal/ui/buttons";
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLE,
  type Invoice,
} from "@/lib/portal/invoices-db";
import { formatInvoiceAmount, fmtInvoiceDate } from "./InvoicingClient";

const ICON_BTN = `grid h-9 w-9 shrink-0 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-base hover:text-ink-base ${FV}`;

// Detail faktury: meta (vystaveno/DUZP/splatnost/VS), položky, souhrn, akce.
// Read-only - návrh se neupravuje (jen schválit / přegenerovat celý měsíc).
export function InvoiceDetailModal({
  invoice,
  isAdmin,
  busy,
  onClose,
  onApprove,
  onPdf,
}: {
  invoice: Invoice;
  isAdmin: boolean;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onPdf: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const draft = invoice.status === "draft";
  const vatPct = Math.round(invoice.totals.vatRate * 100);

  const meta: { label: string; value: string; strong?: boolean }[] = [
    {
      label: "Číslo faktury",
      value: invoice.number ?? "přidělí se schválením",
      strong: !draft,
    },
    { label: "Datum vystavení", value: fmtInvoiceDate(invoice.issuedDate) },
    { label: "DUZP", value: fmtInvoiceDate(invoice.dutyDate) },
    { label: "Datum splatnosti", value: fmtInvoiceDate(invoice.dueDate) },
    { label: "Variabilní symbol", value: invoice.variableSymbol ?? "-" },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-base/40 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-[720px] flex-col rounded-2xl border border-edge bg-paper shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-edge p-6 pb-4">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-soft">
              {draft ? "Návrh faktury" : `Faktura ${invoice.number}`}
            </div>
            <div className="mt-1.5 truncate text-[20px] font-extrabold leading-none tracking-[-0.03em] text-ink-base">
              {invoice.customer.name}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-mid">
              <Chip tone={INVOICE_STATUS_STYLE[invoice.status]}>
                {INVOICE_STATUS_LABEL[invoice.status]}
              </Chip>
              <span>
                {invoice.customer.ico ? `IČO ${invoice.customer.ico}` : "bez IČO"}
                {invoice.customer.dic ? ` · DIČ ${invoice.customer.dic}` : ""}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Zavřít" className={ICON_BTN}>
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {invoice.warnings && invoice.warnings.length > 0 && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-warn-edge bg-warn-tint px-4 py-3 text-[12.5px] text-warn">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <div>
                {invoice.warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {meta.map((m) => (
              <div key={m.label}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                  {m.label}
                </div>
                <div
                  className={`mt-0.5 text-[13px] tabular-nums ${
                    m.strong ? "font-semibold text-ink-base" : "text-ink-deep"
                  }`}
                >
                  {m.value}
                </div>
              </div>
            ))}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                Adresa
              </div>
              <div className="mt-0.5 text-[13px] text-ink-deep">
                {invoice.customer.address ?? "-"}
              </div>
            </div>
          </div>

          {/* Položky */}
          <div className="overflow-hidden rounded-2xl border border-edge">
            <table className="w-full border-collapse text-[13px] tabular-nums">
              <thead>
                <tr>
                  <th className="bg-paper-warm px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-mid">
                    Položka
                  </th>
                  <th className="whitespace-nowrap bg-paper-warm px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-mid">
                    Částka bez DPH
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={`${item.contractId}-${item.periodId}-${i}`} className="border-t border-edge">
                    <td className="px-3 py-2.5 align-top">
                      <div className="font-medium text-ink-base">{item.label}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-mid">{item.description}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right align-top text-ink-deep">
                      {formatInvoiceAmount(item.amountBase, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Souhrn */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-[280px] text-[13px] tabular-nums">
              <div className="flex justify-between py-1 text-ink-deep">
                <span>Základ daně</span>
                <span>{formatInvoiceAmount(invoice.totals.base, invoice.currency)}</span>
              </div>
              <div className="flex justify-between py-1 text-ink-deep">
                <span>DPH {vatPct} %</span>
                <span>{formatInvoiceAmount(invoice.totals.vat, invoice.currency)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-ink-base pt-2 text-[14.5px] font-bold text-ink-base">
                <span>Celkem k úhradě</span>
                <span>{formatInvoiceAmount(invoice.totals.total, invoice.currency)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-edge p-5">
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-10 items-center rounded-full px-4 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base ${FV}`}
          >
            Zavřít
          </button>
          <button
            type="button"
            onClick={onPdf}
            className={`inline-flex h-10 items-center gap-2 rounded-full border border-edge bg-paper px-5 text-[13px] font-semibold text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base ${FV}`}
          >
            <FileDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            PDF
          </button>
          {isAdmin && draft && (
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className={BTN_PRIMARY_MODAL}
            >
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Schválit fakturu
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
