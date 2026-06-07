"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Circle, CircleDashed, CircleDot } from "lucide-react";
import {
  markdownToHtml,
  STATUS_META,
  STATUS_ORDER,
  type TaskStatus,
} from "@/lib/portal/tasks-shared";

export const STATUS_ICON: Record<
  TaskStatus,
  React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>
> = {
  todo: CircleDashed,
  in_progress: CircleDot,
  done: Circle,
};

// Statusový dropdown vykreslený do portálu (neořízne se v kontejneru),
// s auto-flipem nad tlačítko, když dole není místo.
export function StatusDropdown({
  value,
  onChange,
  compact = false,
}: {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuH = 8 + STATUS_ORDER.length * 38;
    const below = window.innerHeight - rect.bottom;
    const top = below < menuH + 8 ? rect.top - menuH - 6 : rect.bottom + 6;
    const width = Math.max(rect.width, 170);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPos({ top, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const meta = STATUS_META[value];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${meta.chip} ${compact ? "" : "min-w-[118px] justify-between"}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
          {meta.label}
        </span>
        <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={2} aria-hidden="true" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 120 }}
            className="overflow-hidden rounded-xl border border-edge bg-paper py-1 shadow-[0_12px_28px_-12px_rgba(14,14,14,0.3)]"
          >
            {STATUS_ORDER.map((s) => {
              const m = STATUS_META[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(s);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] text-ink-base transition-colors hover:bg-paper-warm"
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: m.dot }} />
                    {m.label}
                  </span>
                  {s === value && <Check className="h-3.5 w-3.5 text-ink-base" strokeWidth={2} />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

// Náhled markdownu (sdílené renderování s e-mailem přes markdownToHtml).
export function MarkdownPreview({ md }: { md: string }) {
  if (!md.trim()) {
    return <p className="text-[13px] italic text-ink-soft">Bez popisu.</p>;
  }
  return (
    <div
      className="text-[13.5px] leading-relaxed text-ink-deep [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(md) }}
    />
  );
}
