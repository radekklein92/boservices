"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Download,
  FileUp,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { formatCzk, formatCzkRounded } from "@/lib/portal/claims";
import type { Payout, PayoutStatus } from "@/lib/portal/payouts-db";
import type { PayoutSalespersonRow } from "./CommissionsPayoutsClient";

const STATUS_META: Record<PayoutStatus, { label: string; cls: string }> = {
  podklad: { label: "Čeká na fakturu", cls: "border-amber-300 bg-amber-50 text-amber-700" },
  fakturovano: { label: "Faktura ověřena", cls: "border-sky-300 bg-sky-50 text-sky-700" },
  "zadano-k-uhrade": { label: "Zadáno k úhradě", cls: "border-violet-300 bg-violet-50 text-violet-700" },
  uhrazeno: { label: "Uhrazeno", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
};

const ICON_BTN =
  "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-soft disabled:opacity-40";

type BillingState = {
  name: string;
  ico: string;
  dic: string;
  address: string;
  bankAccount: string;
  isVatPayer: boolean;
};
type CustomerState = { name: string; ico: string; dic: string; address: string };

export function PayoutManagerModal({
  row,
  isAdmin,
  onClose,
}: {
  row: PayoutSalespersonRow;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(row.payouts.length === 0);
  const [amount, setAmount] = useState("");
  const [billing, setBilling] = useState<BillingState>({
    name: row.lastBilling?.name ?? row.name,
    ico: row.lastBilling?.ico ?? "",
    dic: row.lastBilling?.dic ?? "",
    address: row.lastBilling?.address ?? "",
    bankAccount: row.lastBilling?.bankAccount ?? "",
    isVatPayer: row.lastBilling?.isVatPayer ?? false,
  });
  const [customer, setCustomer] = useState<CustomerState>({
    name: row.lastCustomer?.name ?? "",
    ico: row.lastCustomer?.ico ?? "",
    dic: row.lastCustomer?.dic ?? "",
    address: row.lastCustomer?.address ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function createPayout() {
    const amountNum = Math.round(Number(amount.replace(/\s/g, "").replace(",", ".")));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Zadejte částku větší než 0.");
      return;
    }
    if (amountNum > row.available) {
      setError(`Lze vybrat nejvýše ${formatCzkRounded(row.available)}.`);
      return;
    }
    if (!billing.name.trim() || !customer.name.trim()) {
      setError("Vyplňte název dodavatele i odběratele.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salespersonId: row.id,
          amount: amountNum,
          billing,
          customer,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Vytvoření selhalo.");
      setAmount("");
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vytvoření selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadInvoice(payoutId: string, file: File) {
    setUploadingId(payoutId);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/portal/payouts/${payoutId}/invoice`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Nahrání selhalo.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nahrání selhalo.");
    } finally {
      setUploadingId(null);
    }
  }

  async function cancelPayout(payoutId: string) {
    if (!window.confirm("Zrušit tento výběr?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/payouts/${payoutId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Zrušení selhalo.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zrušení selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(payoutId: string, status: PayoutStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/payouts/${payoutId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Změna stavu selhala.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Změna stavu selhala.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-base/40 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-[640px] flex-col rounded-2xl border border-edge bg-paper shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-edge p-6 pb-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-soft">
              Výběry provize
            </div>
            <div className="mt-1.5 text-[20px] font-extrabold leading-none tracking-[-0.03em] text-ink-base">
              {row.name}
            </div>
            <div className="mt-2 text-[12.5px] text-ink-mid">
              K dispozici{" "}
              <span className="font-semibold text-ink-base">
                {formatCzkRounded(row.available)}
              </span>{" "}
              · vybráno {formatCzkRounded(row.paidOut)} z {formatCzkRounded(row.commission)}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Zavřít" className={ICON_BTN}>
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-ink-base bg-ink-base px-4 py-3 text-[12.5px] text-paper">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Nový výběr */}
          {showForm ? (
            <div className="mb-6 rounded-2xl border border-edge bg-paper-warm p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                Nový výběr
              </div>
              <Field label={`Částka (max ${formatCzkRounded(row.available)})`}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="např. 10000"
                  className={INPUT}
                />
              </Field>

              <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                Dodavatel (obchodník)
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field label="Jméno / firma">
                  <input className={INPUT} value={billing.name} onChange={(e) => setBilling({ ...billing, name: e.target.value })} />
                </Field>
                <Field label="IČO">
                  <input className={INPUT} value={billing.ico} onChange={(e) => setBilling({ ...billing, ico: e.target.value })} />
                </Field>
                <Field label="DIČ">
                  <input className={INPUT} value={billing.dic} onChange={(e) => setBilling({ ...billing, dic: e.target.value })} />
                </Field>
                <Field label="Číslo účtu">
                  <input className={INPUT} value={billing.bankAccount} onChange={(e) => setBilling({ ...billing, bankAccount: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Adresa">
                    <input className={INPUT} value={billing.address} onChange={(e) => setBilling({ ...billing, address: e.target.value })} />
                  </Field>
                </div>
              </div>
              <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-deep">
                <input
                  type="checkbox"
                  checked={billing.isVatPayer}
                  onChange={(e) => setBilling({ ...billing, isVatPayer: e.target.checked })}
                  className="h-4 w-4 accent-ink-base"
                />
                Plátce DPH (na fakturu se připočte 21 %)
              </label>

              <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                Odběratel (plátce provize)
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field label="Název">
                  <input className={INPUT} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                </Field>
                <Field label="IČO">
                  <input className={INPUT} value={customer.ico} onChange={(e) => setCustomer({ ...customer, ico: e.target.value })} />
                </Field>
                <Field label="DIČ">
                  <input className={INPUT} value={customer.dic} onChange={(e) => setCustomer({ ...customer, dic: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Adresa">
                    <input className={INPUT} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
                  </Field>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={createPayout}
                  disabled={busy || row.available <= 0}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Vytvořit výběr
                </button>
                {row.payouts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="text-[12.5px] font-medium text-ink-mid hover:text-ink-base"
                  >
                    Zrušit
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              disabled={row.available <= 0}
              className="mb-6 inline-flex h-10 items-center gap-2 rounded-full border border-ink-base bg-paper px-5 text-[13px] font-semibold text-ink-base transition-colors hover:bg-ink-base hover:text-paper disabled:opacity-40 disabled:hover:bg-paper disabled:hover:text-ink-base"
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Vybrat provizi
            </button>
          )}

          {/* Seznam výběrů */}
          {row.payouts.length === 0 ? (
            <div className="text-[13px] text-ink-mid">Zatím žádné výběry.</div>
          ) : (
            <ul className="flex flex-col gap-3">
              {row.payouts.map((p) => (
                <PayoutItem
                  key={p.id}
                  payout={p}
                  isAdmin={isAdmin}
                  busy={busy}
                  uploading={uploadingId === p.id}
                  onUpload={(file) => uploadInvoice(p.id, file)}
                  onCancel={() => cancelPayout(p.id)}
                  onStatus={(s) => setStatus(p.id, s)}
                  fileRef={(el) => {
                    fileRefs.current[p.id] = el;
                  }}
                  onPickFile={() => fileRefs.current[p.id]?.click()}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PayoutItem({
  payout,
  isAdmin,
  busy,
  uploading,
  onUpload,
  onCancel,
  onStatus,
  fileRef,
  onPickFile,
}: {
  payout: Payout;
  isAdmin: boolean;
  busy: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onCancel: () => void;
  onStatus: (s: PayoutStatus) => void;
  fileRef: (el: HTMLInputElement | null) => void;
  onPickFile: () => void;
}) {
  const meta = STATUS_META[payout.status];
  const vat = payout.billing.isVatPayer;
  return (
    <li className="rounded-2xl border border-edge bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[13px] font-bold text-ink-base">
            {payout.variableSymbol}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${meta.cls}`}
          >
            {meta.label}
          </span>
        </div>
        <div className="text-[14px] font-bold tabular-nums text-ink-base">
          {formatCzk(payout.amount)}
          {vat && <span className="text-[11px] font-medium text-ink-mid"> + DPH</span>}
        </div>
      </div>

      {payout.aiCheck?.skipped && (
        <div className="mt-2 text-[11.5px] text-amber-700">
          {payout.aiCheck.reasons[0]}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <a
          href={`/api/portal/payouts/${payout.id}/podklad`}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_BTN}
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Podklad
        </a>
        {payout.invoiceUrl && (
          <a
            href={`/api/portal/payouts/${payout.id}/invoice/download`}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_BTN}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            Faktura
          </a>
        )}

        {payout.status === "podklad" && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={onPickFile}
              disabled={uploading || busy}
              className={ACTION_BTN}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <FileUp className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              )}
              {payout.invoiceUrl ? "Nahrát znovu" : "Nahrát fakturu"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={`${LINK_BTN} hover:border-ink-base`}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Zrušit
            </button>
          </>
        )}

        {isAdmin && payout.status === "fakturovano" && (
          <button type="button" onClick={() => onStatus("zadano-k-uhrade")} disabled={busy} className={ACTION_BTN}>
            Zadat k úhradě
          </button>
        )}
        {isAdmin && payout.status === "zadano-k-uhrade" && (
          <button type="button" onClick={() => onStatus("uhrazeno")} disabled={busy} className={ACTION_BTN}>
            Označit uhrazeno
          </button>
        )}
      </div>
    </li>
  );
}

const INPUT =
  "h-9 w-full rounded-lg border border-edge bg-paper px-2.5 text-[13px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base";
const LINK_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-edge bg-paper px-3 text-[11.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft disabled:opacity-50";
const ACTION_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-full bg-ink-base px-3 text-[11.5px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-mid">
        {label}
      </span>
      {children}
    </label>
  );
}
