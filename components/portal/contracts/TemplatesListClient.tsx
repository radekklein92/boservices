"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Mail,
  FileEdit,
  Eye,
} from "lucide-react";
import type {
  ContractType,
  ContractVariant,
} from "@/lib/portal/contract-types";
import { variantShortLabel } from "@/lib/portal/contract-types";
import type { ContractTemplate } from "@/lib/portal/contract-templates-db";
import { TemplateDiffModal } from "./TemplateDiffModal";

// Položka v plochém listu po expandnutí variant.
export type TemplateRow = {
  type: ContractType;
  variant?: ContractVariant;
  fullName: string;
  shortName: string;
  description: string;
  template: ContractTemplate | null;
  approved: boolean;
};

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Prague",
    });
  } catch {
    return iso;
  }
}

export function TemplatesListClient({
  rows,
  currentUserEmail,
  approverEmails,
}: {
  rows: TemplateRow[];
  currentUserEmail: string;
  // Emaily schvalovatelů. Flag jich může mít víc. Když je pole prázdné, žádný
  // uživatel nemá flag - schvalovat ani připomínat nelze.
  approverEmails: string[];
}) {
  const router = useRouter();
  const hasApprover = approverEmails.length > 0;
  const isApprover = approverEmails.includes(currentUserEmail);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Která šablona má otevřený modal se změnami.
  const [diffRow, setDiffRow] = useState<TemplateRow | null>(null);

  function notify(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }

  function rowKey(r: TemplateRow): string {
    return r.variant ? `${r.type}:${r.variant}` : r.type;
  }

  function templateUrl(r: TemplateRow): string {
    return r.variant
      ? `/portal/templates/${r.type}?variant=${r.variant}`
      : `/portal/templates/${r.type}`;
  }

  async function approve(r: TemplateRow) {
    if (!isApprover) return;
    const key = rowKey(r);
    setBusy(`approve:${key}`);
    try {
      const url = r.variant
        ? `/api/portal/templates/${r.type}/approve?variant=${r.variant}`
        : `/api/portal/templates/${r.type}/approve`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      notify("Šablona schválena.");
      router.refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function remind() {
    setBusy("remind");
    try {
      const res = await fetch("/api/portal/templates/remind", {
        method: "POST",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      const recipientCount = data.recipients?.length ?? 0;
      notify(
        data.sent
          ? `Upozornění odesláno ${
              recipientCount === 1 ? "schvalovateli" : `${recipientCount} schvalovatelům`
            } (${data.pendingCount} čekajících šablon).`
          : "Nic neposláno - všechny šablony jsou aktuálně schválené.",
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {!hasApprover && (
        <div className="mb-6 rounded-2xl border border-edge bg-paper-warm px-5 py-4 text-[12.5px] leading-relaxed text-ink-mid">
          Žádný uživatel zatím nemá zaškrtnuté „Schvalovatel šablon". Bez něj
          nelze schvalovat ani posílat připomínky. Nastavíš v Uživatelé → detail
          → toggle „Schvalovatel šablon".
        </div>
      )}

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((r) => {
          const key = rowKey(r);
          const approveKey = `approve:${key}`;
          const approvedDate = r.approved
            ? formatDate(r.template?.approvedAt)
            : "";
          return (
            <li
              key={key}
              className="flex h-full flex-col justify-between gap-5 rounded-2xl border border-edge bg-paper p-6"
            >
              <Link
                href={templateUrl(r)}
                className="group flex items-start justify-between gap-3"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-edge-warm text-ink-base transition-colors group-hover:bg-ink-base group-hover:text-paper">
                  <FileEdit
                    className="h-4 w-4"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[1.05rem] font-bold leading-snug tracking-[-0.015em] text-ink-base">
                    {r.fullName}
                    {r.variant && (
                      <span className="ml-2 align-middle font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft">
                        var. {variantShortLabel(r.type, r.variant)}
                      </span>
                    )}
                  </h2>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-mid">
                    {r.description}
                  </p>
                </div>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-ink-mid transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  strokeWidth={1.5}
                />
              </Link>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4">
                {r.approved ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-[11.5px] font-semibold text-emerald-700">
                    <CheckCircle2
                      className="h-3.5 w-3.5"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    Schváleno {approvedDate}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-paper-warm px-3.5 py-1.5 text-[11.5px] font-semibold text-ink-deep">
                    <Clock
                      className="h-3.5 w-3.5"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    Čeká na schválení
                  </span>
                )}

                {!r.approved && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDiffRow(r)}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3 text-[12px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
                    >
                      <Eye className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                      Zobrazit změny
                    </button>
                    {isApprover ? (
                      <button
                        type="button"
                        onClick={() => approve(r)}
                        disabled={busy === approveKey}
                        className="inline-flex h-9 items-center gap-2 rounded-full bg-ink-base px-4 text-[12px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
                      >
                        <ShieldCheck
                          className="h-3.5 w-3.5"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        {busy === approveKey ? "Schvaluji…" : "Schválit"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={remind}
                        disabled={!hasApprover || busy === "remind"}
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3 text-[12px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base disabled:opacity-50"
                        title={
                          hasApprover
                            ? `Pošle e-mail schvalovatelům (${approverEmails.join(", ")})`
                            : "Schvalovatel není nastaven"
                        }
                      >
                        <Mail
                          className="h-3.5 w-3.5"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        {busy === "remind" ? "Odesílám…" : "Připomenout e-mailem"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 max-w-md rounded-2xl border border-edge bg-paper px-5 py-4 text-[13.5px] text-ink-base shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)]"
        >
          {toast}
        </div>
      )}

      {diffRow && (
        <TemplateDiffModal
          type={diffRow.type}
          variant={diffRow.variant}
          title={`${diffRow.fullName}${
            diffRow.variant
              ? ` · var. ${variantShortLabel(diffRow.type, diffRow.variant)}`
              : ""
          }`}
          onClose={() => setDiffRow(null)}
          onApprove={
            isApprover
              ? async () => {
                  if (!diffRow) return;
                  await approve(diffRow);
                  setDiffRow(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
