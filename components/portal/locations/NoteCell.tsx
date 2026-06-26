"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";

// Inline editor poznámky (SDÍLENÁ s lokalitou — endpoint /note). Kompaktní
// náhled, po kliknutí expanduje na textarea. Ukládá on-blur + debounce ~900 ms
// (ne na každý úhoz). Per-buňka feedback; chyba zůstane viditelná.
export function NoteCell({
  id,
  value,
  onApplied,
}: {
  id: string;
  value: string;
  onApplied: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync z venku (refresh / cizí změna), pokud zrovna needitujeme.
  useEffect(() => {
    if (!editing) setVal(value);
  }, [value, editing]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function save(text: string) {
    if (text === value) {
      setSaved(false);
      return;
    }
    setSaving(true);
    setError(false);
    setSaved(false);
    try {
      const res = await fetch(`/api/portal/locations/${id}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: text }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "save failed");
      onApplied(text);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setVal(text);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(text), 900);
  }

  function onBlur() {
    if (timer.current) clearTimeout(timer.current);
    setEditing(false);
    save(val);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
          // fokus po renderu
          setTimeout(() => taRef.current?.focus(), 0);
        }}
        className="group/note flex w-full min-w-[170px] max-w-[260px] items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[12.5px] transition-colors hover:bg-edge-warm"
      >
        {val ? (
          <span className="line-clamp-1 text-ink-deep">{val}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-ink-soft">
            <Pencil className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
            Přidat…
          </span>
        )}
        {saving && <Loader2 className="ml-auto h-3 w-3 shrink-0 animate-spin text-ink-soft" aria-hidden="true" />}
        {saved && !saving && <Check className="ml-auto h-3 w-3 shrink-0 text-emerald-600" strokeWidth={2.5} aria-hidden="true" />}
        {error && <span className="ml-auto shrink-0 text-[11px] text-red-600">chyba</span>}
      </button>
    );
  }

  return (
    <div className="min-w-[200px]">
      <textarea
        ref={taRef}
        value={val}
        onChange={onChange}
        onBlur={onBlur}
        onClick={(e) => e.stopPropagation()}
        rows={2}
        placeholder="Poznámka k lokalitě…"
        className="w-full resize-y rounded-lg border border-ink-base bg-paper px-2.5 py-1.5 text-[12.5px] leading-snug text-ink-base outline-none placeholder:text-ink-soft"
      />
      <div className="mt-0.5 flex h-3 items-center gap-1.5 text-[11px]">
        {saving && <span className="text-ink-soft">Ukládám…</span>}
        {saved && !saving && <span className="text-emerald-600">Uloženo</span>}
        {error && <span className="text-red-600">Nepodařilo se uložit</span>}
      </div>
    </div>
  );
}
