"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import type { ReAgent } from "@/lib/portal/locations-db";
import { RE_AGENT_LABEL } from "./locations-shared";

const AGENTS: ReAgent[] = ["Krampera", "Siarik", "Kholova", "Gransky", "Neuzil"];

// Inline editor RE agenta. Dropdown přes createPortal (neořízne se v
// overflow-x-auto kontejneru tabulky) + auto-flip; vzor StatusDropdown.
// Optimistic: po výběru hned ukáže novou hodnotu (buňka ztlumená než server
// potvrdí), při chybě rollback. Položka "Podle Transitionu" pošle null = smaže
// lokální volbu a hodnota spadne zpět na Transition.
export function ReAgentCell({
  id,
  value,
  fromTransition,
  onApplied,
}: {
  id: string;
  // effectiveReAgent (lokální volba ?? Transition ?? null)
  value: ReAgent | null;
  // true = value pochází z Transition (žádná lokální volba)
  fromTransition: boolean;
  onApplied: (localReAgent: ReAgent | null, effectiveReAgent: ReAgent | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  // undefined = řízeno propem; jinak optimistic override (vč. null).
  const [optimistic, setOptimistic] = useState<ReAgent | null | undefined>(undefined);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const shown = optimistic !== undefined ? optimistic : value;

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuH = 8 + (AGENTS.length + 1) * 38;
    const below = window.innerHeight - rect.bottom;
    const top = below < menuH + 8 ? rect.top - menuH - 6 : rect.bottom + 6;
    const width = Math.max(rect.width, 180);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPos({ top, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  async function choose(next: ReAgent | null) {
    setOpen(false);
    const localChoice = fromTransition ? null : value;
    if (next === localChoice) return; // beze změny lokální volby
    setOptimistic(next);
    setPending(true);
    setError(false);
    try {
      const res = await fetch(`/api/portal/locations/${id}/re-agent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reAgent: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "save failed");
      onApplied(data.reAgent ?? null, data.effectiveReAgent ?? null);
      setOptimistic(undefined); // rows se aktualizují → value bude autoritativní
    } catch {
      setOptimistic(undefined); // rollback na původní value
      setError(true);
      setTimeout(() => setError(false), 2600);
    } finally {
      setPending(false);
    }
  }

  const showDot = fromTransition && shown && optimistic === undefined && !pending;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={pending}
        title={
          error
            ? "Uložení selhalo, zkuste to znovu"
            : showDot
              ? "Hodnota z Transitionu (bez lokální volby)"
              : undefined
        }
        className={`inline-flex min-w-[120px] items-center justify-between gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
          error
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-edge bg-paper text-ink-deep hover:border-ink-soft"
        } ${pending ? "pointer-events-none opacity-50" : ""}`}
      >
        <span className="inline-flex items-center gap-1.5">
          {showDot && (
            <span className="h-1.5 w-1.5 rounded-full bg-ink-soft" aria-hidden="true" />
          )}
          <span className={shown ? "" : "text-ink-soft"}>
            {shown ? RE_AGENT_LABEL[shown] : "Nepřiřazeno"}
          </span>
        </span>
        <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={2} aria-hidden="true" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 120 }}
            className="overflow-hidden rounded-xl border border-edge bg-paper py-1 shadow-[0_12px_28px_-12px_rgba(14,14,14,0.3)]"
          >
            {AGENTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  choose(a);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] text-ink-base transition-colors hover:bg-paper-warm"
              >
                <span>{RE_AGENT_LABEL[a]}</span>
                {(optimistic !== undefined ? optimistic : value) === a &&
                  !fromTransition && <Check className="h-3.5 w-3.5 text-ink-base" strokeWidth={2} />}
              </button>
            ))}
            <div className="my-1 h-px bg-edge" aria-hidden="true" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                choose(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-ink-mid transition-colors hover:bg-paper-warm"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Podle Transitionu
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
