"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileWarning,
  RefreshCw,
  Save,
  ScanLine,
  Trash2,
  Upload,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { Contract } from "@/lib/portal/contracts-db";
import {
  CONTRACT_TYPE_META,
  type ContractType,
} from "@/lib/portal/contract-types";
import { TiptapEditor } from "./TiptapEditor";
import { PlaceholderPalette } from "./PlaceholderPalette";

type Props = {
  initial: Contract;
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

export function ContractDetailClient({ initial }: Props) {
  const router = useRouter();
  const [contract, setContract] = useState(initial);
  const [html, setHtml] = useState(initial.html);
  const [variables, setVariables] = useState(initial.variables);
  const [contractNumber, setContractNumber] = useState(initial.number ?? "");
  const [dirty, setDirty] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [genPending, setGenPending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const meta = CONTRACT_TYPE_META[contract.type as ContractType];

  function notify(kind: "ok" | "error", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 3500);
  }

  function updateHtml(next: string) {
    setHtml(next);
    setDirty(true);
  }
  function updateVar(key: string, value: string) {
    setVariables((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }
  function updateNumber(value: string) {
    setContractNumber(value);
    setDirty(true);
  }

  function handleInsert(token: string) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus().insertContent(token).run();
  }

  async function save() {
    setSavePending(true);
    try {
      const res = await fetch(`/api/portal/contracts/${contract.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          variables,
          number: contractNumber.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Uložení selhalo.");
      const reload = await fetch(`/api/portal/contracts/${contract.id}`);
      const j = await reload.json();
      if (j.ok) setContract(j.contract);
      setDirty(false);
      notify("ok", "Uloženo.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setSavePending(false);
    }
  }

  async function generatePdf() {
    if (dirty) await save();
    setGenPending(true);
    try {
      const res = await fetch(
        `/api/portal/contracts/${contract.id}/generate`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Generování selhalo.");
      const reload = await fetch(`/api/portal/contracts/${contract.id}`);
      const j = await reload.json();
      if (j.ok) setContract(j.contract);
      notify("ok", "PDF vygenerováno.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setGenPending(false);
    }
  }

  async function uploadScan(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadPending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/portal/contracts/${contract.id}/scan`,
        { method: "POST", body: fd },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Nahrání selhalo.");
      const reload = await fetch(`/api/portal/contracts/${contract.id}`);
      const j = await reload.json();
      if (j.ok) setContract(j.contract);
      notify("ok", "Sken nahrán.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setUploadPending(false);
    }
  }

  async function removeScan() {
    if (!window.confirm("Odebrat nahraný sken?")) return;
    try {
      const res = await fetch(
        `/api/portal/contracts/${contract.id}/scan`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      const reload = await fetch(`/api/portal/contracts/${contract.id}`);
      const j = await reload.json();
      if (j.ok) setContract(j.contract);
      notify("ok", "Sken odebrán.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    }
  }

  async function removeContract() {
    if (
      !window.confirm(
        `Smazat smlouvu „${contract.clientName}"? Akce je nevratná.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/portal/contracts/${contract.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      router.push("/portal/contracts");
      router.refresh();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link
          href="/portal/contracts"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mid transition-colors hover:text-ink-base"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
          Smlouvy
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-extrabold text-ink-base text-[clamp(1.6rem,2.8vw,2rem)] leading-[1.1] tracking-[-0.025em]">
              {contract.clientName}
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-mid">
              {meta.fullName}
              {contract.generatedAt && (
                <>
                  {" · "}vygenerováno {formatDateTime(contract.generatedAt)}
                </>
              )}
              {contract.scanUploadedAt && (
                <>
                  {" · "}sken {formatDateTime(contract.scanUploadedAt)}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={savePending || !dirty}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-edge bg-paper px-4 text-[13px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              {savePending ? "Ukládám…" : "Uložit"}
            </button>
            <button
              type="button"
              onClick={generatePdf}
              disabled={genPending}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
            >
              {genPending ? (
                "Generuji…"
              ) : (
                <>
                  <RefreshCw
                    className="h-3.5 w-3.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  {contract.generatedPdfUrl ? "Přegenerovat PDF" : "Vygenerovat PDF"}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={removeContract}
              aria-label="Smazat smlouvu"
              className="grid h-10 w-10 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-base hover:bg-ink-base hover:text-paper"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* PDF actions */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ActionCard
          title="Vygenerované PDF"
          subtitle={
            contract.generatedAt
              ? `vytvořeno ${formatDateTime(contract.generatedAt)}`
              : "ještě nevygenerováno"
          }
          Icon={CheckCircle2}
          active={!!contract.generatedPdfUrl}
        >
          {contract.generatedPdfUrl ? (
            <a
              href={contract.generatedPdfUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-ink-base px-4 text-[12px] font-semibold text-paper transition-transform active:translate-y-px"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Stáhnout PDF
            </a>
          ) : (
            <span className="text-[12px] text-ink-mid">
              Klikněte na „Vygenerovat PDF" výše.
            </span>
          )}
        </ActionCard>

        <ActionCard
          title="Naskenovaná kopie"
          subtitle={
            contract.scanUploadedAt
              ? `nahráno ${formatDateTime(contract.scanUploadedAt)}`
              : "podepsaná verze ještě nenahrána"
          }
          Icon={ScanLine}
          active={!!contract.scanPdfUrl}
        >
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={uploadScan}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadPending}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-4 text-[12px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              {uploadPending
                ? "Nahrávám…"
                : contract.scanPdfUrl
                  ? "Nahrát novou verzi"
                  : "Nahrát sken"}
            </button>
            {contract.scanPdfUrl && (
              <>
                <a
                  href={contract.scanPdfUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-ink-base px-4 text-[12px] font-semibold text-paper"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Stáhnout
                </a>
                <button
                  type="button"
                  onClick={removeScan}
                  aria-label="Odebrat sken"
                  className="grid h-9 w-9 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-base hover:bg-ink-base hover:text-paper"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>
        </ActionCard>
      </section>

      {/* Variables */}
      <section className="rounded-2xl border border-edge bg-paper p-5 md:p-6">
        <div className="mb-4 flex items-baseline gap-2.5">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-base">
            Hodnoty placeholderů
          </h2>
          <span className="text-[11.5px] text-ink-mid">
            · Pole, která se dosadí při generování. Vlastnosti klienta jsou
            předvyplněné.
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SmallField
            label="Číslo smlouvy"
            value={contractNumber}
            placeholder="2026/001"
            onChange={updateNumber}
          />
          <SmallField
            label="Místo uzavření"
            value={variables.place ?? ""}
            placeholder="Praha"
            onChange={(v) => updateVar("place", v)}
          />
          <SmallField
            label="Datum uzavření"
            value={variables.contractDate ?? ""}
            placeholder="17. května 2026"
            onChange={(v) => updateVar("contractDate", v)}
          />
          <SmallField
            label="Datum účinnosti"
            value={variables.effectiveDate ?? ""}
            placeholder="1. června 2026"
            onChange={(v) => updateVar("effectiveDate", v)}
          />
          <SmallField
            label="Zástupce poskytovatele - jméno"
            value={variables.providerStatutoryName ?? ""}
            placeholder="Mgr. Ondřej Benáček"
            onChange={(v) => updateVar("providerStatutoryName", v)}
          />
          <SmallField
            label="Zástupce poskytovatele - funkce"
            value={variables.providerStatutoryRole ?? ""}
            placeholder="jednatel"
            onChange={(v) => updateVar("providerStatutoryRole", v)}
          />
        </div>

        {dirty && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-edge bg-paper-warm px-3 py-1.5 text-[11.5px] text-ink-deep">
            <FileWarning className="h-3 w-3 text-ink-mid" strokeWidth={1.5} />
            Máte neuložené změny.
          </div>
        )}
      </section>

      {/* Editor */}
      <section>
        <div className="mb-3 flex items-baseline gap-2.5">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-base">
            Znění smlouvy
          </h2>
          <span className="text-[11.5px] text-ink-mid">
            · Editujte text. Placeholdery se nahradí hodnotami nahoře.
          </span>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
          <div>
            <TiptapEditor
              value={html}
              onChange={updateHtml}
              editorRef={(e) => (editorRef.current = e)}
            />
          </div>
          <aside className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-2xl border border-edge bg-paper-warm">
            <div className="flex-1 overflow-y-auto p-4">
              <PlaceholderPalette onInsert={handleInsert} />
            </div>
          </aside>
        </div>
      </section>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 max-w-md rounded-2xl border px-5 py-4 text-[13.5px] shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] ${
            toast.kind === "ok"
              ? "border-edge bg-paper text-ink-base"
              : "border-ink-base bg-ink-base text-paper"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function ActionCard({
  title,
  subtitle,
  Icon,
  active,
  children,
}: {
  title: string;
  subtitle: string;
  Icon: typeof CheckCircle2;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-4 rounded-2xl border bg-paper p-5",
        active ? "border-ink-base" : "border-edge",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
            active ? "bg-ink-base text-paper" : "bg-edge-warm text-ink-deep",
          ].join(" ")}
        >
          <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-bold tracking-[-0.01em] text-ink-base">
            {title}
          </div>
          <div className="text-[11.5px] text-ink-mid">{subtitle}</div>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function SmallField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-edge bg-paper px-3 text-[13.5px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
      />
    </label>
  );
}
