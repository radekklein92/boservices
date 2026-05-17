"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, ShieldCheck } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { ContractType } from "@/lib/portal/contract-types";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
import { TiptapEditor } from "./TiptapEditor";
import { PlaceholderPalette } from "./PlaceholderPalette";

type Props = {
  type: ContractType;
  initialHtml: string;
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
    });
  } catch {
    return iso;
  }
}

export function TemplateEditorClient({
  type,
  initialHtml,
  updatedAt,
  updatedBy,
  isAdmin,
}: Props) {
  const router = useRouter();
  const meta = CONTRACT_TYPE_META[type];
  const [html, setHtml] = useState(initialHtml);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<string | null>(updatedAt);
  const [savedBy, setSavedBy] = useState<string>(updatedBy);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);

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
      const res = await fetch(`/api/portal/templates/${type}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
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
              className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13.5px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
        <div className={isAdmin ? "" : "pointer-events-none opacity-90"}>
          <TiptapEditor
            value={html}
            onChange={setHtml}
            editorRef={(e) => (editorRef.current = e)}
          />
        </div>
        <div className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start">
          <div className="rounded-2xl border border-edge bg-paper-warm p-4 lg:max-h-[calc(100dvh-3rem)]">
            <PlaceholderPalette onInsert={handleInsert} />
          </div>
        </div>
      </div>
    </div>
  );
}
