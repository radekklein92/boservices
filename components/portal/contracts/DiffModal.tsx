"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import {
  CONTRACT_TYPE_META,
  type ContractType,
} from "@/lib/portal/contract-types";
import { BTN_ROW } from "@/components/portal/ui/buttons";

// Diff modal mezi aktuálním zněním smlouvy a původní šablonou (Word-style
// track changes - <ins> = aktuální text, <del> = původní). Pro bundle
// smlouvy zobrazuje tabs per sekci. Server endpoint /api/portal/contracts
// /[id]/diff vrací diffHtml nebo pole sections s per-sekcí diffHtml + count.

export type DiffSectionPayload = {
  type: ContractType;
  hasChanges: boolean;
  changeCount: number;
  diffHtml: string;
};

export function DiffModal({
  contractId,
  onClose,
}: {
  contractId: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | {
        kind: "ok";
        diffHtml: string;
        count: number;
        sections?: DiffSectionPayload[];
      }
    | { kind: "error"; msg: string }
  >({ kind: "loading" });
  const [activeTab, setActiveTab] = useState(0);

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
        const res = await fetch(`/api/portal/contracts/${contractId}/diff`);
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
          sections: data.sections,
        });
        setActiveTab(0);
      } catch (err) {
        if (alive) {
          setState({
            kind: "error",
            msg: err instanceof Error ? err.message : "Chyba",
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [contractId]);

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
              Přehled změn
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Smlouva vs. šablona
            </h2>
            {state.kind === "ok" && (
              <p className="mt-1 text-[12px] text-ink-mid">
                {state.count}{" "}
                {state.count === 1
                  ? "změna"
                  : state.count < 5
                    ? "změny"
                    : "změn"}{" "}
                · červené škrtnutí = původní text ze šablony, červené
                podtržení = aktuální text smlouvy.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {state.kind === "ok" && state.count > 0 && (
              <a
                href={`/api/portal/contracts/${contractId}/diff-pdf`}
                target="_blank"
                rel="noreferrer noopener"
                className={BTN_ROW}
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                Export do PDF
              </a>
            )}
            <button
              type="button"
              aria-label="Zavřít"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>

        {state.kind === "ok" && state.sections && state.sections.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-edge px-6 pb-px">
            {state.sections.map((section, i) => {
              const active = i === activeTab;
              return (
                <button
                  key={section.type}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={[
                    "relative inline-flex h-11 items-center gap-2 whitespace-nowrap px-4 text-[12.5px] font-medium transition-colors",
                    active
                      ? "text-ink-base"
                      : "text-ink-mid hover:text-ink-base",
                  ].join(" ")}
                >
                  {CONTRACT_TYPE_META[section.type].shortName}
                  {section.hasChanges && (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-ink-base px-1.5 text-[10px] font-semibold text-paper">
                      {section.changeCount}
                    </span>
                  )}
                  {active && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink-base" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="max-h-[70vh] overflow-y-auto p-6 md:p-8">
          {state.kind === "loading" && (
            <div className="text-[13px] text-ink-mid">Načítám změny…</div>
          )}
          {state.kind === "error" && (
            <div role="alert" className="text-[13px] text-ink-deep">
              {state.msg}
            </div>
          )}
          {state.kind === "ok" && (
            <>
              {state.sections && state.sections.length > 0 ? (
                state.sections[activeTab]?.hasChanges ? (
                  <div
                    className="diff-view"
                    dangerouslySetInnerHTML={{
                      __html: state.sections[activeTab]!.diffHtml,
                    }}
                  />
                ) : (
                  <div className="rounded-2xl border border-edge bg-paper-warm px-5 py-6 text-[13px] text-ink-mid">
                    Tato sekce se od šablony neliší.
                  </div>
                )
              ) : (
                <div
                  className="diff-view"
                  dangerouslySetInnerHTML={{ __html: state.diffHtml }}
                />
              )}
            </>
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
