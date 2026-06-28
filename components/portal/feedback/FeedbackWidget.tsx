"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Check,
  Copy,
  Loader2,
  MessageSquarePlus,
  MousePointerClick,
  Pencil,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { BTN_PRIMARY_MODAL } from "@/components/portal/ui/buttons";
import { routeLabelFor, type ChatMessage, type PickedElement } from "@/lib/portal/feedback-shared";
import { capturePageContext, describeElement } from "./page-context";

// Plovoucí feedback widget na každé stránce portálu. Otevře malý AI chat, který
// zná kontext stránky (capturePageContext), doptá se a sestaví návrh zadání;
// po potvrzení ho pošle do Konzole změn jako návrh. Kořeny mají data-feedback-skip,
// aby se widget nezahrnoval do zachyceného kontextu stránky.

const SKIP = "[data-feedback-skip]";

type Draft = { title: string; spec: string };
type DisplayMessage = { role: "user" | "assistant"; content: string; draft?: Draft };
type Rect = { x: number; y: number; w: number; h: number };

export function FeedbackWidget({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  void userEmail; // identita drží server (requireSession); prop kvůli budoucímu použití
  const pathname = usePathname() ?? "";
  const pageLabel = routeLabelFor(pathname, "Tato stránka");

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"chat" | "done">("chat");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PickedElement | undefined>(undefined);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const greeting = useCallback(
    (): DisplayMessage => ({
      role: "assistant",
      content: `Ahoj! Jsi na stránce „${pageLabel}". Co bys tu chtěl/a vylepšit, nebo co nefunguje? Klidně to popiš vlastními slovy. Můžeš taky označit text na stránce nebo kliknout na „Ukázat prvek" a ukázat mi, čeho se to týká.`,
    }),
    [pageLabel],
  );

  // Po navigaci na jinou stránku zavřít a vyresetovat (kontext se mění).
  useEffect(() => {
    setOpen(false);
    setMessages([]);
    setPhase("chat");
    setPicked(undefined);
    setPicking(false);
    setError(null);
  }, [pathname]);

  // Uvítací zpráva při otevření prázdného chatu.
  useEffect(() => {
    if (open && messages.length === 0) setMessages([greeting()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Scroll na konec.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Focus na vstup po otevření.
  useEffect(() => {
    if (open && phase === "chat") {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open, phase]);

  // Esc zavře panel (mimo režim výběru prvku).
  useEffect(() => {
    if (!open || picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, picking]);

  // Režim výběru prvku: hover highlight + klik zachytí prvek, Esc ruší.
  useEffect(() => {
    if (!picking) return;
    const valid = (el: Element | null): el is Element =>
      !!el && !el.closest(SKIP) && el.tagName !== "HTML" && el.tagName !== "BODY";
    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!valid(el)) {
        setHoverRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setHoverRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (valid(el)) setPicked(describeElement(el));
      setPicking(false);
      setHoverRect(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPicking(false);
        setHoverRect(null);
      }
    };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [picking]);

  const close = () => setOpen(false);

  const reset = () => {
    setMessages([greeting()]);
    setPhase("chat");
    setPicked(undefined);
    setInput("");
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next: DisplayMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setSending(true);
    setError(null);
    try {
      const page = capturePageContext(picked);
      const apiMessages: ChatMessage[] = next.map((m) =>
        m.draft
          ? { role: m.role, content: `Navrhuji toto zadání:\nNázev: ${m.draft.title}\n\n${m.draft.spec}` }
          : { role: m.role, content: m.content },
      );
      const res = await fetch("/api/portal/feedback/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, page }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: json?.error || "Teď se mi nepovedlo odpovědět. Zkus to prosím za chvíli znovu." },
        ]);
        return;
      }
      if (json.mode === "draft") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Mám návrh zadání. Mrkni na něj - můžeš ho rovnou odeslat, nebo mi napiš, co upravit.",
            draft: { title: json.title, spec: json.spec },
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: json.message }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Spojení selhalo. Zkus to prosím znovu." },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, picked]);

  const submit = useCallback(
    async (draft: Draft) => {
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const page = capturePageContext(picked);
        const res = await fetch("/api/portal/feedback/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title,
            spec: draft.spec,
            page: {
              path: page.path,
              title: page.title,
              routeLabel: page.routeLabel,
              selection: page.selection,
              picked: page.picked,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Odeslání selhalo.");
        setPhase("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Odeslání selhalo.");
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, picked],
  );

  const copy = useCallback(async (draft: Draft) => {
    try {
      await navigator.clipboard.writeText(`${draft.title}\n\n${draft.spec}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard nedostupný - ticho */
    }
  }, []);

  // Index poslední zprávy s návrhem (jen ten je akční).
  let lastDraftIdx = -1;
  messages.forEach((m, i) => {
    if (m.draft) lastDraftIdx = i;
  });

  return (
    <>
      {/* Plovoucí tlačítko */}
      {!open && !picking && (
        <button
          type="button"
          data-feedback-skip
          onClick={() => setOpen(true)}
          aria-label="Zpětná vazba a návrh změny"
          title="Něco vylepšit na této stránce?"
          className="group fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-ink-base text-paper shadow-[0_12px_32px_-10px_rgba(14,14,14,0.55)] transition-transform hover:scale-105 active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          <MessageSquarePlus className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}

      {/* Chat panel */}
      {open && !picking && (
        <div
          data-feedback-skip
          role="dialog"
          aria-label="Návrh změny"
          className="fixed bottom-5 right-5 z-50 flex h-[min(560px,calc(100dvh-1.5rem))] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-edge bg-paper shadow-[0_24px_60px_-20px_rgba(14,14,14,0.45)]"
        >
          {/* Hlavička */}
          <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-base text-paper">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold leading-tight text-ink-base">Návrh změny</div>
                <div className="truncate text-[11px] text-ink-mid">{pageLabel}</div>
              </div>
            </div>
            <button
              type="button"
              aria-label="Zavřít"
              onClick={close}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
            >
              <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>

          {phase === "done" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <Check className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="text-[15px] font-semibold text-ink-base">Díky! Návrh jsme předali.</div>
              <p className="max-w-[30ch] text-[13px] leading-relaxed text-ink-mid">
                Objeví se v Konzoli změn, kde ho tým buď rovnou spustí, nebo vyřeší ručně.
              </p>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-edge px-4 text-[13px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
                >
                  Napsat další
                </button>
                <button type="button" onClick={close} className={BTN_PRIMARY_MODAL}>
                  Zavřít
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Zprávy */}
              <div
                ref={scrollRef}
                aria-live="polite"
                className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
              >
                {messages.map((m, i) => (
                  <MessageBubble
                    key={i}
                    message={m}
                    isLatestDraft={i === lastDraftIdx}
                    submitting={submitting}
                    copied={copied}
                    onSubmit={submit}
                    onCopy={copy}
                    onRefine={() => inputRef.current?.focus()}
                  />
                ))}
                {sending && (
                  <div className="mr-auto inline-flex items-center gap-1.5 rounded-2xl bg-edge-warm px-3.5 py-2.5">
                    <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
                  </div>
                )}
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                    {error}
                  </div>
                )}
              </div>

              {/* Vstup */}
              <div className="border-t border-edge p-3">
                <div className="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-edge px-2.5 text-[12px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
                    title="Klikni na prvek na stránce, kterého se to týká"
                  >
                    <MousePointerClick className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                    Ukázat prvek
                  </button>
                  {picked && (
                    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-edge-warm px-2.5 py-1 text-[11.5px] text-ink-deep">
                      <span className="max-w-[140px] truncate">
                        Vybráno: {picked.text || picked.selector}
                      </span>
                      <button
                        type="button"
                        aria-label="Zrušit vybraný prvek"
                        onClick={() => setPicked(undefined)}
                        className="text-ink-mid hover:text-ink-base"
                      >
                        <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    rows={1}
                    onChange={(e) => {
                      setInput(e.target.value);
                      autosize(e.target);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="Napište, co byste tu změnili…"
                    className="max-h-[120px] min-h-[40px] w-full resize-none rounded-xl border border-edge bg-paper px-3 py-2 text-[13px] leading-relaxed text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={sending || !input.trim()}
                    aria-label="Odeslat"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink-base text-paper transition-transform active:translate-y-px disabled:opacity-40"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-snug text-ink-soft">
                  Enter odešle, Shift+Enter nový řádek. Asistent vidí obsah této stránky.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Režim výběru prvku */}
      {picking && (
        <>
          {hoverRect && (
            <div
              data-feedback-skip
              className="pointer-events-none fixed z-[60] rounded-[3px] border-2 border-ink-base bg-ink-base/10"
              style={{
                left: hoverRect.x,
                top: hoverRect.y,
                width: hoverRect.w,
                height: hoverRect.h,
              }}
              aria-hidden="true"
            />
          )}
          <div
            data-feedback-skip
            className="fixed inset-x-0 top-4 z-[60] mx-auto flex w-fit items-center gap-2 rounded-full bg-ink-base px-4 py-2 text-[12.5px] font-medium text-paper shadow-[0_12px_32px_-10px_rgba(14,14,14,0.55)]"
          >
            <MousePointerClick className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Klikni na prvek, kterého se to týká. Esc zruší.
          </div>
        </>
      )}
    </>
  );
}

function MessageBubble({
  message,
  isLatestDraft,
  submitting,
  copied,
  onSubmit,
  onCopy,
  onRefine,
}: {
  message: DisplayMessage;
  isLatestDraft: boolean;
  submitting: boolean;
  copied: boolean;
  onSubmit: (d: Draft) => void;
  onCopy: (d: Draft) => void;
  onRefine: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink-base px-3.5 py-2 text-[13px] leading-relaxed text-paper">
        {message.content}
      </div>
    );
  }

  return (
    <div className="flex max-w-[92%] flex-col gap-2">
      {message.content && (
        <div className="mr-auto whitespace-pre-wrap rounded-2xl rounded-bl-md bg-edge-warm px-3.5 py-2 text-[13px] leading-relaxed text-ink-deep">
          {message.content}
        </div>
      )}
      {message.draft && (
        <div className="rounded-2xl border border-edge bg-paper p-3.5 shadow-[0_8px_24px_-14px_rgba(14,14,14,0.3)]">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mid">
            Návrh zadání
          </div>
          <div className="text-[13.5px] font-semibold leading-snug text-ink-base">
            {message.draft.title}
          </div>
          <div className="mt-1.5 max-h-44 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-deep">
            {message.draft.spec}
          </div>
          {isLatestDraft && (
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onSubmit(message.draft!)}
                disabled={submitting}
                className={`${BTN_PRIMARY_MODAL} w-full justify-center`}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Send className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                )}
                Odeslat do změn portálu
              </button>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => onCopy(message.draft!)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  {copied ? "Zkopírováno" : "Kopírovat zadání"}
                </button>
                <button
                  type="button"
                  onClick={onRefine}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  Ještě upravit
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dot({ delay = "0s" }: { delay?: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft"
      style={{ animationDelay: delay }}
      aria-hidden="true"
    />
  );
}
