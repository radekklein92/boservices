"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Banknote,
  Check,
  CheckCheck,
  FileDown,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { FilterChip } from "@/components/portal/ui/FilterChip";
import { Chip } from "@/components/portal/ui/Chip";
import { SelectMenu } from "@/components/portal/ui/SelectMenu";
import { ResultCount } from "@/components/portal/ui/ResultCount";
import { EmptyState } from "@/components/portal/ui/EmptyState";
import { BTN_TOOL, BTN_ROW, BTN_PRIMARY_MODAL } from "@/components/portal/ui/buttons";
import { TONE_WARN, DOT_WARN, DOT_GOOD } from "@/lib/portal/tone";
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLE,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/portal/invoices-db";
import { InvoiceDetailModal } from "./InvoiceDetailModal";

// Částky faktur se zobrazují s 2 desetinnými (daňový doklad) - na rozdíl od
// zaokrouhlených přehledů Poplatků.
export function formatInvoiceAmount(n: number, currency: string): string {
  const v = n.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "CZK" ? `${v} Kč` : `${v} ${currency}`;
}

export function fmtInvoiceDate(iso: string | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

// "2026-06" → "červen 2026".
export function invoiceMonthLabel(month: string): string {
  try {
    return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("cs-CZ", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return month;
  }
}

async function callApi(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Akce selhala.",
    );
  }
  return data;
}

export function InvoicingClient({
  invoices,
  months,
  isAdmin,
}: {
  invoices: Invoice[];
  // Uzavřené měsíce (od floor Poplatků po předchozí měsíc) - možnosti filtru
  // a cíl generování.
  months: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // Měsíc, do kterého generujeme: zvolený filtr, jinak poslední uzavřený.
  const targetMonth =
    monthFilter !== "all" ? monthFilter : months[months.length - 1];

  const monthOptions = useMemo(
    () => [
      { value: "all", label: "Všechny měsíce" },
      // Nejnovější první (stejně jako řazení seznamu).
      ...[...months].reverse().map((m) => ({ value: m, label: invoiceMonthLabel(m) })),
    ],
    [months],
  );

  const byMonth = useMemo(
    () =>
      monthFilter === "all"
        ? invoices
        : invoices.filter((i) => i.month === monthFilter),
    [invoices, monthFilter],
  );

  const counts = useMemo(() => {
    const c: Record<InvoiceStatus, number> = { draft: 0, approved: 0 };
    for (const i of byMonth) c[i.status]++;
    return c;
  }, [byMonth]);

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? byMonth
        : byMonth.filter((i) => i.status === statusFilter),
    [byMonth, statusFilter],
  );

  // Součty per měna (celkem s DPH) přes zobrazené faktury.
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of filtered) {
      m.set(i.currency, (m.get(i.currency) ?? 0) + i.totals.total);
    }
    return [...m.entries()];
  }, [filtered]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Akce selhala.");
    } finally {
      setBusy(null);
    }
  }

  function generate() {
    if (!targetMonth) return;
    const label = invoiceMonthLabel(targetMonth);
    const hasAny = invoices.some((i) => i.month === targetMonth);
    if (
      hasAny &&
      !window.confirm(
        `Návrhy za ${label} se přepočtou z aktuálních čísel Poplatků. Schválené faktury se nezmění. Pokračovat?`,
      )
    ) {
      return;
    }
    void run("generate", async () => {
      await callApi("/api/portal/invoices/generate", { month: targetMonth });
    });
  }

  function approveAll() {
    const scope =
      monthFilter === "all" ? "všech měsíců" : `za ${invoiceMonthLabel(monthFilter)}`;
    if (
      !window.confirm(
        `Schválit ${counts.draft} návrhů ${scope}? Faktury dostanou čísla a stanou se daňovými doklady.`,
      )
    ) {
      return;
    }
    void run("approve-all", async () => {
      const data = await callApi(
        "/api/portal/invoices/approve-all",
        monthFilter === "all" ? {} : { month: monthFilter },
      );
      const failed = data.failed as { customer: string; error: string }[];
      if (failed?.length) {
        throw new Error(
          `Neschváleno: ${failed.map((f) => `${f.customer} (${f.error})`).join("; ")}`,
        );
      }
    });
  }

  function approveOne(inv: Invoice) {
    if (
      !window.confirm(
        `Schválit fakturu pro ${inv.customer.name}? Faktura dostane číslo a stane se daňovým dokladem.`,
      )
    ) {
      return;
    }
    setOpenId(null);
    void run(`approve:${inv.id}`, async () => {
      await callApi(`/api/portal/invoices/${inv.id}/approve`);
    });
  }

  function unapproveOne(inv: Invoice) {
    if (
      !window.confirm(
        `Vzít zpět schválení faktury ${inv.number ?? ""} pro ${inv.customer.name}? Faktura se vrátí mezi návrhy a uložené PDF se zahodí. Poslední číslo řady se uvolní, starší zůstane rezervované pro nové schválení.`,
      )
    ) {
      return;
    }
    setOpenId(null);
    void run(`unapprove:${inv.id}`, async () => {
      await callApi(`/api/portal/invoices/${inv.id}/unapprove`);
    });
  }

  function openPdf(inv: Invoice) {
    window.open(`/api/portal/invoices/${inv.id}/pdf`, "_blank");
  }

  const open = openId ? invoices.find((i) => i.id === openId) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Filtry: stav + měsíc vlevo, souhrn/počet/akce (admin) vpravo */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
          label="Vše"
          count={byMonth.length}
        />
        <FilterChip
          active={statusFilter === "draft"}
          onClick={() => setStatusFilter("draft")}
          label="Návrhy"
          count={counts.draft}
          dotClass={DOT_WARN}
        />
        <FilterChip
          active={statusFilter === "approved"}
          onClick={() => setStatusFilter("approved")}
          label="Schválené"
          count={counts.approved}
          dotClass={DOT_GOOD}
        />
        <span className="mx-1 h-5 w-px shrink-0 bg-edge" aria-hidden="true" />
        <SelectMenu
          value={monthFilter}
          options={monthOptions}
          onChange={setMonthFilter}
          ariaLabel="Filtr měsíce"
        />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {totals.map(([cur, sum]) => (
            <span key={cur} className="text-[12px] text-ink-mid">
              <span className="text-ink-soft">celkem s DPH</span>{" "}
              <span className="font-semibold text-ink-base">
                {formatInvoiceAmount(sum, cur)}
              </span>
            </span>
          ))}
          <ResultCount shown={filtered.length} total={invoices.length} />
          {isAdmin && counts.draft > 0 && (
            <button
              type="button"
              onClick={approveAll}
              disabled={busy !== null}
              className={BTN_TOOL}
              title="Schválí zobrazené návrhy - faktury dostanou čísla a PDF"
            >
              <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Schválit vše
              <span className="font-mono text-[11px] text-ink-soft">{counts.draft}</span>
            </button>
          )}
          {isAdmin && targetMonth && (
            <button
              type="button"
              onClick={generate}
              disabled={busy !== null}
              className={BTN_TOOL}
              title={`Vygeneruje/přepočte návrhy za ${invoiceMonthLabel(targetMonth)} z aktuálních Poplatků; schválené faktury se nemění`}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${busy === "generate" ? "animate-spin" : ""}`}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Vygenerovat návrhy
              <span className="font-mono text-[11px] text-ink-soft">
                {invoiceMonthLabel(targetMonth)}
              </span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-danger-edge bg-danger-tint px-4 py-3 text-[12.5px] text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {invoices.length === 0 ? (
        <EmptyState
          icon={<Banknote className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />}
          title="Zatím žádné faktury"
          description={
            isAdmin
              ? "Návrhy vznikají automaticky 1. den měsíce za právě skončený měsíc. Můžete je vygenerovat i ručně z aktuálních Poplatků."
              : "Návrhy vznikají automaticky 1. den měsíce a schvaluje je administrátor."
          }
          action={
            isAdmin && targetMonth ? (
              <button
                type="button"
                onClick={generate}
                disabled={busy !== null}
                className={BTN_PRIMARY_MODAL}
              >
                <RefreshCw
                  className={`h-4 w-4 ${busy === "generate" ? "animate-spin" : ""}`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Vygenerovat návrhy ({invoiceMonthLabel(targetMonth)})
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-edge bg-paper">
          <table className="w-full min-w-[980px] border-collapse text-[13px] tabular-nums">
            <thead>
              <tr>
                {["Odběratel", "Období", "Položek", "Základ daně", "DPH 21 %", "Celkem", "Číslo", "Stav", ""].map(
                  (label, i) => (
                    <th
                      key={i}
                      className={`whitespace-nowrap bg-paper-warm px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-mid ${
                        i >= 2 && i <= 5 ? "text-right" : "text-left"
                      }`}
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => setOpenId(inv.id)}
                  className="group cursor-pointer border-t border-edge transition-colors hover:bg-paper-warm"
                >
                  <td className="px-3 py-2.5 align-middle">
                    <div className="flex min-w-0 flex-col">
                      <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold tracking-[-0.01em] text-ink-base">
                        <span className="max-w-[240px] truncate">{inv.customer.name}</span>
                        {inv.warnings && inv.warnings.length > 0 && (
                          <Chip tone={TONE_WARN} className="shrink-0">
                            <AlertCircle className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                            podklady
                          </Chip>
                        )}
                      </span>
                      <span className="truncate text-[11px] text-ink-soft">
                        {inv.customer.ico ? `IČO ${inv.customer.ico}` : "bez IČO"}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 align-middle text-ink-deep">
                    {invoiceMonthLabel(inv.month)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle text-ink-deep">
                    {inv.items.length}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle text-ink-deep">
                    {formatInvoiceAmount(inv.totals.base, inv.currency)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle text-ink-deep">
                    {formatInvoiceAmount(inv.totals.vat, inv.currency)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle font-semibold text-ink-base">
                    {formatInvoiceAmount(inv.totals.total, inv.currency)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 align-middle font-mono text-[12px] text-ink-deep">
                    {inv.number ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                    <Chip tone={INVOICE_STATUS_STYLE[inv.status]}>
                      {INVOICE_STATUS_LABEL[inv.status]}
                    </Chip>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPdf(inv);
                        }}
                        className={BTN_ROW}
                        title={inv.status === "draft" ? "PDF návrhu (s vodoznakem)" : "PDF faktury"}
                      >
                        <FileDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        PDF
                      </button>
                      {isAdmin && inv.status === "draft" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            approveOne(inv);
                          }}
                          disabled={busy !== null}
                          className={BTN_ROW}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                          Schválit
                        </button>
                      )}
                      {isAdmin && inv.status === "approved" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            unapproveOne(inv);
                          }}
                          disabled={busy !== null}
                          className={BTN_ROW}
                          title="Vrátí fakturu mezi návrhy; poslední číslo řady se uvolní, starší zůstane rezervované"
                        >
                          <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          Vzít zpět
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-[13px] text-ink-soft">
                    Žádné faktury neodpovídají filtru.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <InvoiceDetailModal
          invoice={open}
          isAdmin={isAdmin}
          busy={busy !== null}
          onClose={() => setOpenId(null)}
          onApprove={() => approveOne(open)}
          onUnapprove={() => unapproveOne(open)}
          onPdf={() => openPdf(open)}
        />
      )}
    </div>
  );
}
