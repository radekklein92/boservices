"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, RotateCcw } from "lucide-react";

export type SelectOption = { value: string; label: string };

export type TransitionField =
  | "re_agent"
  | "lease_current_status"
  | "lease_target_status";

// Inline editor pole, které je zdrojem pravdy v Transition. Dropdown přes
// createPortal (neořízne se v overflow-x-auto kontejneru tabulky) + auto-flip;
// vzor StatusDropdown. Optimistic: po výběru hned ukáže novou hodnotu (buňka
// ztlumená než server potvrdí), při chybě rollback. Uložení jde write-through
// přes /api/portal/locations/[id]/transition-field → Transition → zrcadlo.
export function TransitionSelectCell({
  id,
  field,
  value,
  options,
  placeholder,
  allowClear = false,
  clearLabel = "Vymazat",
  onApplied,
}: {
  id: string;
  field: TransitionField;
  value: string | null;
  options: SelectOption[];
  placeholder: string;
  // allowClear = nabídnout volbu „vymazat" (pošle null) — používá se u re_agent.
  allowClear?: boolean;
  clearLabel?: string;
  onApplied: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  // undefined = řízeno propem; jinak optimistic override (vč. null).
  const [optimistic, setOptimistic] = useState<string | null | undefined>(undefined);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const shown = optimistic !== undefined ? optimistic : value;
  const shownLabel = shown ? (options.find((o) => o.value === shown)?.label ?? shown) : null;
  const rowCount = options.length + (allowClear ? 1 : 0);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuH = 8 + rowCount * 38;
    const below = window.innerHeight - rect.bottom;
    const top = below < menuH + 8 ? rect.top - menuH - 6 : rect.bottom + 6;
    const width = Math.max(rect.width, 190);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPos({ top, left, width });
  }, [open, rowCount]);

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

  async function choose(next: string | null) {
    setOpen(false);
    if (next === value) return; // beze změny
    setOptimistic(next);
    setPending(true);
    setError(false);
    try {
      const res = await fetch(`/api/portal/locations/${id}/transition-field`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "save failed");
      onApplied((data.value ?? next) as string | null);
      setOptimistic(undefined); // rows se aktualizují → value bude autoritativní
    } catch {
      setOptimistic(undefined); // rollback na původní value
      setError(true);
      setTimeout(() => setError(false), 2600);
    } finally {
      setPending(false);
    }
  }

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
        title={error ? "Uložení selhalo, zkuste to znovu" : undefined}
        className={`inline-flex min-w-[130px] items-center justify-between gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
          error
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-edge bg-paper text-ink-deep hover:border-ink-soft"
        } ${pending ? "pointer-events-none opacity-50" : ""}`}
      >
        <span className={`truncate ${shownLabel ? "" : "text-ink-soft"}`}>
          {shownLabel ?? placeholder}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" strokeWidth={2} aria-hidden="true" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 120 }}
            className="overflow-hidden rounded-xl border border-edge bg-paper py-1 shadow-[0_12px_28px_-12px_rgba(14,14,14,0.3)]"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  choose(o.value);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] text-ink-base transition-colors hover:bg-paper-warm"
              >
                <span>{o.label}</span>
                {shown === o.value && (
                  <Check className="h-3.5 w-3.5 text-ink-base" strokeWidth={2} />
                )}
              </button>
            ))}
            {allowClear && (
              <>
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
                  {clearLabel}
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
