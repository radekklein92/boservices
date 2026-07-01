"use client";

import { useEffect, useRef, useState } from "react";
import dynamicImport from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, ShieldCheck } from "lucide-react";
import type { Editor } from "@tiptap/react";
import {
  CONTRACT_TYPE_META,
  getVariantsForType,
  getVariantMeta,
  hasVariants,
  type ContractType,
  type ContractVariant,
} from "@/lib/portal/contract-types";
import { PlaceholderPalette } from "./PlaceholderPalette";

const TiptapEditor = dynamicImport(
  () => import("./TiptapEditor").then((m) => m.TiptapEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-xl bg-edge-warm" />
    ),
  },
);

type Props = {
  type: ContractType;
  variant?: ContractVariant;
  initialHtml: string;
  initialLetterhead: boolean;
  updatedAt: string;
  updatedBy: string;
  isAdmin: boolean;
};

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

export function TemplateEditorClient({
  type,
  variant,
  initialHtml,
  initialLetterhead,
  updatedAt,
  updatedBy,
  isAdmin,
}: Props) {
  const router = useRouter();
  const meta = CONTRACT_TYPE_META[type];
  const showVariants = hasVariants(type);
  const [html, setHtml] = useState(initialHtml);
  const [letterhead, setLetterhead] = useState(initialLetterhead);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<string | null>(updatedAt);
  const [savedBy, setSavedBy] = useState<string>(updatedBy);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);

  // Při přepnutí varianty (jen search-param change) Next reusne komponentu
  // a useState() drží starý initialHtml. Sync props -> state, jinak by editor
  // dál ukazoval znění předchozí varianty.
  useEffect(() => {
    setHtml(initialHtml);
    setLetterhead(initialLetterhead);
    setSaved(updatedAt);
    setSavedBy(updatedBy);
    setError(null);
  }, [type, variant, initialHtml, initialLetterhead, updatedAt, updatedBy]);

  function handleInsert(token: string) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus().insertContent(token).run();
  }

  async function save() {
    if (!isAdmin) return;
    setPending(true);
    setError(null);
    try {
      const url = variant
        ? `/api/portal/templates/${type}?variant=${variant}`
        : `/api/portal/templates/${type}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, letterhead }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Uložení selhalo.");
      setSaved(new Date().toISOString());
      setSavedBy("vy");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href="/portal/templates"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mid transition-colors hover:text-ink-base"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
            Šablony
          </Link>
          <h1 className="mt-3 font-extrabold text-ink-base text-[clamp(1.6rem,3vw,2.1rem)] leading-[1.1] tracking-[-0.025em]">
            {meta.fullName}
          </h1>
          <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-ink-mid">
            {meta.description}
            {saved && (
              <>
                {" · "}
                Naposledy upraveno {formatDateTime(saved)} ({savedBy}).
              </>
            )}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            {error && (
              <span role="alert" className="text-[12.5px] text-ink-deep">
                {error}
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
            >
              {pending ? (
                "Ukládám…"
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  Uložit šablonu
                </>
              )}
            </button>
          </div>
        )}
      </header>

      {!isAdmin && (
        <div className="flex items-center gap-2 rounded-lg border border-edge bg-paper-warm px-4 py-2.5 text-[12.5px] text-ink-deep">
          <ShieldCheck className="h-3.5 w-3.5 text-ink-mid" strokeWidth={1.5} />
          Šablonu mohou upravovat jen administrátoři. Vy si ji můžete jen
          prohlédnout.
        </div>
      )}

      {showVariants && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-paper p-3 md:p-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mid">
            Varianta
          </span>
          <div className="inline-flex items-center gap-1 rounded-full border border-edge bg-paper-warm p-1">
            {getVariantsForType(type).map((v) => {
              const vm = getVariantMeta(type, v);
              if (!vm) return null;
              const active = v === variant;
              return (
                <Link
                  key={v}
                  href={`/portal/templates/${type}?variant=${v}`}
                  className={[
                    "inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold transition-colors",
                    active
                      ? "bg-ink-base text-paper"
                      : "text-ink-mid hover:text-ink-base",
                  ].join(" ")}
                >
                  {vm.label}
                </Link>
              );
            })}
          </div>
          <span className="text-[11.5px] text-ink-mid">
            · Každá varianta se ukládá samostatně.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-paper p-3 md:p-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mid">
          Hlavičkový papír
        </span>
        <div className="inline-flex items-center gap-1 rounded-full border border-edge bg-paper-warm p-1">
          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => setLetterhead(true)}
            className={[
              "inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed",
              letterhead
                ? "bg-ink-base text-paper"
                : "text-ink-mid hover:text-ink-base",
            ].join(" ")}
          >
            Zapnuto (logo + patička)
          </button>
          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => setLetterhead(false)}
            className={[
              "inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed",
              !letterhead
                ? "bg-ink-base text-paper"
                : "text-ink-mid hover:text-ink-base",
            ].join(" ")}
          >
            Vypnuto (jen čísla stránek)
          </button>
        </div>
        <span className="text-[11.5px] text-ink-mid">
          ·{" "}
          {letterhead
            ? "PDF bude mít logo v záhlaví, brand text v patičce + čísla stránek."
            : "PDF bez loga a brand textu; v patičce zůstávají jen čísla stránek."}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <div className={isAdmin ? "" : "pointer-events-none opacity-90"}>
          <TiptapEditor
            value={html}
            onChange={setHtml}
            editorRef={(e) => (editorRef.current = e)}
          />
        </div>
        <aside className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-2xl border border-edge bg-paper-warm">
          <div className="flex-1 overflow-y-auto p-4">
            <PlaceholderPalette onInsert={handleInsert} />
          </div>
        </aside>
      </div>
    </div>
  );
}
