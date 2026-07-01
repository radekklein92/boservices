"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { LocationsBrainstorm as Note } from "@/lib/portal/locations-notes-db";

type Props = { initial: Note | null };

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Prague",
    });
  } catch {
    return iso;
  }
}

const PLACEHOLDER = `Sem si pište cokoliv k lokalitám.

Tipy:
- Která lokalita má nejhoršího pronajímatele? Proč?
- Co bychom měli evidovat navíc, co vás napadá z provozu?
- Které informace jsou kritické při krizi (havárie, výpověď)?
- Jaké soubory bychom u lokality měli vždycky mít?
- Existují nějaké pravidelné poplatky, na které pořád zapomínáme?
- Specifické věci pro OC (marketingový fond, výpověď bez důvodu, ...)?
`;

export function LocationsBrainstorm({ initial }: Props) {
  const [content, setContent] = useState(initial?.content ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<{
    at: string;
    by: string;
  } | null>(
    initial ? { at: initial.updatedAt, by: initial.updatedBy } : null,
  );
  const timerRef = useRef<number | null>(null);

  // Autosave s 800 ms debounce
  useEffect(() => {
    if (state !== "pending") return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const snapshot = content;
    timerRef.current = window.setTimeout(async () => {
      setState("saving");
      try {
        const res = await fetch("/api/portal/locations/brainstorm", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: snapshot }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Uložení selhalo.");
        setState("saved");
        setError(null);
        setLastSaved({ at: data.updatedAt, by: "vy" });
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : "Chyba");
      }
    }, 800);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [state, content]);

  function onChange(next: string) {
    setContent(next);
    setState("pending");
  }

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-edge bg-paper p-7 md:p-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink-base text-paper">
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-mid">
              Brainstorming
            </div>
            <h2 className="text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
              Co by tu mělo být - vaše nápady
            </h2>
            <p className="mt-1 max-w-[58ch] text-[12.5px] text-ink-mid">
              Pole je sdílené - ostatní vidí to, co tu napíšete. Ukládá se
              automaticky.
            </p>
          </div>
        </div>
        <SaveBadge state={state} error={error} lastSaved={lastSaved} />
      </div>

      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        className="min-h-[280px] w-full resize-y rounded-2xl border border-edge bg-paper-warm p-5 text-[13.5px] leading-relaxed text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
      />
    </section>
  );
}

function SaveBadge({
  state,
  error,
  lastSaved,
}: {
  state: SaveState;
  error: string | null;
  lastSaved: { at: string; by: string } | null;
}) {
  if (state === "pending" || state === "saving") {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[11.5px] font-medium text-ink-mid">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-soft" />
        Ukládám…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span
        className="inline-flex h-9 items-center gap-2 rounded-full border border-ink-base bg-ink-base px-3.5 text-[11.5px] font-medium text-paper"
        title={error ?? undefined}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-paper" />
        Neuloženo
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[11.5px] font-medium text-ink-deep">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-base" />
        Uloženo
      </span>
    );
  }
  if (lastSaved) {
    return (
      <span className="text-[11.5px] text-ink-mid">
        Naposledy upraveno {formatDateTime(lastSaved.at)} ({lastSaved.by})
      </span>
    );
  }
  return null;
}
