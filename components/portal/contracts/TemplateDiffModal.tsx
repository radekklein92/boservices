"use client";

import { useEffect, useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import type { ContractType, ContractVariant } from "@/lib/portal/contract-types";
import { sanitizeContractHtml } from "@/lib/portal/sanitize-html";

// Modal s přehledem změn šablony (track changes: <ins> přidáno, <del> smazáno)
// proti naposledy schválené verzi. Volitelně umožní schvalovateli rovnou
// schválit přímo z modalu.
export function TemplateDiffModal({
  type,
  variant,
  title,
  onClose,
  onApprove,
}: {
  type: ContractType;
  variant?: ContractVariant;
  title: string;
  onClose: () => void;
  // Pokud je předáno, zobrazí se tlačítko „Schválit". Vrací po dokončení.
  onApprove?: () => Promise<void> | void;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; diffHtml: string; count: number; comparedToDefault: boolean }
    | { kind: "error"; msg: string }
  >({ kind: "loading" });
  const [approving, setApproving] = useState(false);

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
    let alive = true;
    (async () => {
      try {
        const qs = variant ? `?variant=${variant}` : "";
        const res = await fetch(`/api/portal/templates/${type}/diff${qs}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!alive) return;
        if (!data.ok) {
          setState({ kind: "error", msg: data.error ?? "Chyba" });
          return;
        }
        setState({
          kind: "ok",
          diffHtml: data.diffHtml,
          count: data.changeCount,
          comparedToDefault: !!data.comparedToDefault,
        });
      } catch (err) {
        if (alive) {
          setState({ kind: "error", msg: err instanceof Error ? err.message : "Chyba" });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [type, variant]);

  async function handleApprove() {
    if (!onApprove) return;
    setApproving(true);
    try {
      await onApprove();
    } finally {
      setApproving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-8 backdrop-blur-sm md:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex w-full max-w-[920px] flex-col rounded-2xl border border-edge bg-paper shadow-[0_24px_60px_-20px_rgba(14,14,14,0.35)]">
        <div className="flex items-start justify-between gap-4 border-b border-edge p-6">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              Změny v šabloně
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              {title}
            </h2>
            {state.kind === "ok" && (
              <p className="mt-1 text-[12px] text-ink-mid">
                {state.count}{" "}
                {state.count === 1 ? "změna" : state.count < 5 ? "změny" : "změn"}
                {" · "}červené škrtnutí = původní text,{" "}červené podtržení = nový text.
                {state.comparedToDefault && (
                  <span className="text-ink-soft">
                    {" · "}Porovnáno s výchozí šablonou (chybí schválená verze).
                  </span>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[64vh] overflow-y-auto p-6 md:p-8">
          {state.kind === "loading" && (
            <div className="text-[13px] text-ink-mid">Načítám změny…</div>
          )}
          {state.kind === "error" && (
            <div role="alert" className="text-[13px] text-ink-deep">
              {state.msg}
            </div>
          )}
          {state.kind === "ok" &&
            (state.count === 0 ? (
              <div className="rounded-2xl border border-edge bg-paper-warm px-5 py-6 text-[13px] text-ink-mid">
                Žádné změny proti schválené verzi.
              </div>
            ) : (
              <div
                className="diff-view"
                dangerouslySetInnerHTML={{ __html: sanitizeContractHtml(state.diffHtml) }}
              />
            ))}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-edge px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full px-5 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base"
          >
            Zavřít
          </button>
          {onApprove && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
            >
              <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {approving ? "Schvaluji…" : "Schválit"}
            </button>
          )}
        </div>

        <style jsx global>{`
          .diff-view {
            font-size: 14px;
            line-height: 1.65;
            color: var(--color-ink-base);
          }
          .diff-view h1, .diff-view h2, .diff-view h3 {
            font-weight: 700;
            margin-top: 1.25em;
          }
          .diff-view h1 { font-size: 1.4rem; }
          .diff-view h2 { font-size: 1.1rem; border-bottom: 1px solid var(--color-edge); padding-bottom: 0.3em; }
          .diff-view h3 { font-size: 1rem; }
          .diff-view p { margin: 0.5em 0; }
          .diff-view ol, .diff-view ul { padding-left: 1.5em; margin: 0.5em 0; }
          .diff-view ol { list-style: decimal; }
          .diff-view ul { list-style: disc; }
          .diff-view ins {
            background: rgba(220, 38, 38, 0.10);
            color: #B91C1C;
            text-decoration: underline;
            text-decoration-thickness: 1.5px;
            text-underline-offset: 3px;
            padding: 0 2px;
            border-radius: 2px;
          }
          .diff-view del {
            background: rgba(220, 38, 38, 0.06);
            color: #B91C1C;
            text-decoration: line-through;
            text-decoration-thickness: 1.5px;
            padding: 0 2px;
            border-radius: 2px;
          }
        `}</style>
      </div>
    </div>
  );
}
