"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, CornerDownLeft, User, Zap } from "lucide-react";
import { formatDeadline, parseQuickAdd, type Task } from "@/lib/portal/tasks-shared";
import type { MemberOption } from "./types";

// Rychlé přidání úkolu z jednoho řádku. Parsuje @řešitele a české datum
// (dnes/zítra/pondělí/DD.MM./za 3 dny), zbytek je název.
export function CommandPalette({
  members,
  onCreated,
  onClose,
  onOpenDetail,
}: {
  members: MemberOption[];
  onCreated: (t: Task) => void;
  onClose: () => void;
  onOpenDetail: (draft: { title: string; assignee: string; deadline: string | null }) => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const memberNames = useMemo(() => members.map((m) => m.name).filter(Boolean), [members]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parsed = useMemo(() => parseQuickAdd(text, memberNames), [text, memberNames]);

  async function create() {
    if (!parsed.title.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/portal/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: parsed.title,
          assignee: parsed.assignee,
          deadline: parsed.deadline,
        }),
      });
      const data = await res.json();
      if (data.ok) onCreated(data.task as Task);
      else setSaving(false);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center px-4 pt-[14vh]">
      <motion.div
        className="absolute inset-0 bg-ink-base/25 backdrop-blur-[1px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-edge bg-paper shadow-[0_24px_64px_-24px_rgba(14,14,14,0.45)]"
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Zap className="h-4 w-4 shrink-0 text-ink-mid" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
            placeholder="Nový úkol… např. „Zavolat dodavateli @Radek zítra"
            className="flex-1 bg-transparent text-[15px] text-ink-base outline-none placeholder:text-ink-soft"
          />
          <button
            type="button"
            onClick={create}
            disabled={!parsed.title.trim() || saving}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-base px-3 py-1.5 text-[12px] font-semibold text-paper disabled:opacity-40"
          >
            <CornerDownLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Přidat
          </button>
        </div>

        {(parsed.assignee || parsed.deadline) && (
          <div className="flex items-center gap-2 border-t border-edge px-4 py-2.5">
            {parsed.assignee && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-edge-warm px-2.5 py-1 text-[11.5px] font-medium text-ink-deep">
                <User className="h-3 w-3" strokeWidth={1.8} /> {parsed.assignee}
              </span>
            )}
            {parsed.deadline && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-edge-warm px-2.5 py-1 text-[11.5px] font-medium text-ink-deep">
                <CalendarDays className="h-3 w-3" strokeWidth={1.8} />{" "}
                {formatDeadline(parsed.deadline).text}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-edge bg-paper-warm px-4 py-2 text-[11px] text-ink-mid">
          <span>@jméno · termín (dnes, zítra, pá, 14.6., za 3 dny)</span>
          <button
            type="button"
            onClick={() => onOpenDetail(parsed)}
            className="font-medium text-ink-deep underline-offset-2 hover:underline"
          >
            Více možností →
          </button>
        </div>
      </motion.div>
    </div>
  );
}
