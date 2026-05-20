"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  FileWarning,
  PenLine,
  Package,
  RefreshCw,
  Save,
  ScanLine,
  Trash2,
  Undo2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { BundleSection, Contract } from "@/lib/portal/contracts-db";
import {
  CONTRACT_TYPE_META,
  getVariantsForType,
  getVariantMeta,
  hasVariants,
  isBundleType,
  variantShortLabel,
  type ContractType,
  type ContractVariant,
} from "@/lib/portal/contract-types";
import { WITHDRAWAL_KS_TEXTS } from "@/lib/portal/contract-render";
import { extractPlaceholderTokens } from "@/lib/portal/contract-render";
import { TiptapEditor } from "./TiptapEditor";
import { PlaceholderPalette } from "./PlaceholderPalette";
import {
  DebtorPresetPicker,
  type DebtorFillPayload,
} from "./DebtorPresetPicker";
import {
  CompanyChipPicker,
  type CompanyFillPayload,
} from "./CompanyChipPicker";

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

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export function ContractDetailClient({ initial }: Props) {
  const router = useRouter();
  const [contract, setContract] = useState(initial);
  const [html, setHtml] = useState(initial.html);
  const [bundleSections, setBundleSections] = useState<BundleSection[]>(
    initial.bundleSections ?? [],
  );
  const [variables, setVariables] = useState(initial.variables);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [genPending, setGenPending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  // Pro bundle: index aktuálně fokusovaného editoru - kam se vkládají placeholdery.
  const [activeBundleIdx, setActiveBundleIdx] = useState(0);
  const editorRef = useRef<Editor | null>(null);
  const bundleEditorRefs = useRef<(Editor | null)[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(false);

  const isBundle = isBundleType(contract.type);
  const dirty = saveState === "pending" || saveState === "saving";

  // Template changes detection - pro bundle agreguje napříč sekcemi.
  const hasTemplateChanges = isBundle
    ? bundleSections.some(
        (s) => s.templateSnapshot && s.templateSnapshot !== s.html,
      )
    : !!contract.templateSnapshot && contract.templateSnapshot !== html;

  const meta = CONTRACT_TYPE_META[contract.type as ContractType];

  // Placeholder tokens - pro bundle scanuje všechny sekce, jinak single html.
  const usedTokens = useMemo(() => {
    if (isBundle) {
      const set = new Set<string>();
      for (const section of bundleSections) {
        for (const token of extractPlaceholderTokens(section.html)) {
          set.add(token);
        }
      }
      return set;
    }
    return extractPlaceholderTokens(html);
  }, [isBundle, html, bundleSections]);
  const has = (token: string) => usedTokens.has(token);
  const hasAny = (tokens: string[]) => tokens.some((t) => usedTokens.has(t));

  function notify(kind: "ok" | "error", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 3500);
  }

  function markDirty() {
    setSaveState("pending");
    setSaveError(null);
  }

  function updateHtml(next: string) {
    setHtml(next);
    markDirty();
  }
  function updateBundleSection(idx: number, nextHtml: string) {
    setBundleSections((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx]!, html: nextHtml };
      return copy;
    });
    markDirty();
  }
  function updateVar(key: string, value: string) {
    setVariables((prev) => ({ ...prev, [key]: value }));
    markDirty();
  }
  function fillDebtor(payload: DebtorFillPayload) {
    setVariables((prev) => ({ ...prev, ...payload }));
    markDirty();
    notify("ok", `Dlužník vyplněn: ${payload.debtorName || payload.debtorIco}.`);
  }
  function fillManager(p: CompanyFillPayload) {
    setVariables((prev) => ({
      ...prev,
      managerName: p.name,
      managerIco: p.ico,
      managerStreet: p.street,
      managerCity: p.city,
      managerZip: p.zip,
    }));
    markDirty();
    notify("ok", `Manažer vyplněn: ${p.name || p.ico}.`);
  }
  function fillWithdrawalProvider(p: CompanyFillPayload) {
    setVariables((prev) => ({
      ...prev,
      providerName: p.name,
      providerIco: p.ico,
      providerStreet: p.street,
      providerCity: p.city,
      providerZip: p.zip,
    }));
    markDirty();
    notify("ok", `Poskytovatel vyplněn: ${p.name || p.ico}.`);
  }
  function setKsMode(mode: string) {
    // Toggle „KS padá" / „KS zůstává v platnosti" se promítne do 4 placeholderů,
    // které šablona vykresluje na příslušných místech:
    // - ksIntroLineSeparator: ; nebo . za FS řádkem v Úvodním prohlášení
    // - ksIntroClause: <li>KS bod 3</li> v Úvodním prohlášení (jen když padá)
    // - ksDropClause: „a KS" dovětek v bodě 4 Odstoupení (jen když padá)
    // - ksPreservedClause: bod 5 prohlášení o zachování KS (jen když zůstává)
    const texts =
      mode === "preserved"
        ? WITHDRAWAL_KS_TEXTS.preserved
        : WITHDRAWAL_KS_TEXTS.dropped;
    setVariables((prev) => ({
      ...prev,
      ksIntroLineSeparator: texts.ksIntroLineSeparator,
      ksIntroClause: texts.ksIntroClause,
      ksDropClause: texts.ksDropClause,
      ksPreservedClause: texts.ksPreservedClause,
    }));
    markDirty();
  }

  function handleInsert(token: string) {
    if (isBundle) {
      const editor = bundleEditorRefs.current[activeBundleIdx];
      if (!editor) return;
      editor.chain().focus().insertContent(token).run();
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus().insertContent(token).run();
  }

  async function performSave(
    htmlSnapshot: string,
    variablesSnapshot: Record<string, string>,
    bundleSnapshot: BundleSection[],
  ) {
    setSaveState("saving");
    try {
      const body: Record<string, unknown> = {
        variables: variablesSnapshot,
      };
      if (isBundle) {
        body.bundleSections = bundleSnapshot.map((s) => ({
          type: s.type,
          html: s.html,
        }));
      } else {
        body.html = htmlSnapshot;
      }
      const res = await fetch(`/api/portal/contracts/${contract.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Uložení selhalo.");
      const reload = await fetch(`/api/portal/contracts/${contract.id}`);
      const j = await reload.json();
      if (j.ok && isMountedRef.current) setContract(j.contract);
      if (isMountedRef.current) {
        setSaveState("saved");
        setSaveError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setSaveState("error");
        setSaveError(err instanceof Error ? err.message : "Chyba");
      }
    }
  }

  // Auto-save: debounced 800 ms after last edit
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (saveState !== "pending") return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const htmlSnap = html;
    const varsSnap = variables;
    const bundleSnap = bundleSections;
    saveTimerRef.current = window.setTimeout(() => {
      performSave(htmlSnap, varsSnap, bundleSnap);
    }, 800);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, variables, bundleSections, saveState]);

  async function ensureSaved() {
    if (saveState === "pending" || saveState === "saving") {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      await performSave(html, variables, bundleSections);
    }
  }

  async function generatePdf() {
    await ensureSaved();
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

  async function setMilestone(kind: "signed" | "picked-up") {
    try {
      const res = await fetch(
        `/api/portal/contracts/${contract.id}/${kind}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      const reload = await fetch(`/api/portal/contracts/${contract.id}`);
      const j = await reload.json();
      if (j.ok) setContract(j.contract);
      notify(
        "ok",
        kind === "signed"
          ? "Označeno jako podepsáno jednateli."
          : "Označeno jako vyzvednuto obchodníkem.",
      );
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    }
  }

  async function unsetMilestone(kind: "signed" | "picked-up") {
    const label = kind === "signed" ? "podepsání" : "vyzvednutí";
    if (!window.confirm(`Zrušit označení ${label}?`)) return;
    try {
      const res = await fetch(
        `/api/portal/contracts/${contract.id}/${kind}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      const reload = await fetch(`/api/portal/contracts/${contract.id}`);
      const j = await reload.json();
      if (j.ok) setContract(j.contract);
      notify("ok", "Označení zrušeno.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
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
          <div className="flex flex-wrap items-center gap-3">
            <SaveIndicator state={saveState} error={saveError} />
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

      {/* Milestones - 4 kroky */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ActionCard
          step="1"
          title="Vygenerované PDF"
          subtitle={
            contract.generatedAt
              ? `vytvořeno ${formatDateTime(contract.generatedAt)}`
              : "ještě nevygenerováno"
          }
          Icon={FileText}
          done={!!contract.generatedPdfUrl}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {contract.generatedPdfUrl ? (
                <a
                  href={`/api/portal/contracts/${contract.id}/download/generated`}
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
            </div>
            <DiffSection
              hasChanges={hasTemplateChanges}
              onOpen={() => setDiffOpen(true)}
              diffPdfUrl={`/api/portal/contracts/${contract.id}/diff-pdf`}
            />
          </div>
        </ActionCard>

        <ActionCard
          step="2"
          title="Podepsáno jednateli"
          subtitle={
            contract.signedAt
              ? `${formatDateTime(contract.signedAt)}${
                  contract.signedBy ? ` · ${contract.signedBy}` : ""
                }`
              : "po vytisknutí a podpisu jednateli"
          }
          Icon={PenLine}
          done={!!contract.signedAt}
        >
          {contract.signedAt ? (
            <button
              type="button"
              onClick={() => unsetMilestone("signed")}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-edge px-3 text-[12px] font-medium text-ink-mid transition-colors hover:border-ink-base hover:text-ink-base"
            >
              <Undo2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Zrušit označení
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMilestone("signed")}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-ink-base px-4 text-[12px] font-semibold text-paper transition-transform active:translate-y-px"
            >
              <PenLine className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Označit jako podepsáno
            </button>
          )}
        </ActionCard>

        <ActionCard
          step="3"
          title="Vyzvednuto obchodníkem"
          subtitle={
            contract.pickedUpAt
              ? `${formatDateTime(contract.pickedUpAt)}${
                  contract.pickedUpBy ? ` · ${contract.pickedUpBy}` : ""
                }`
              : "obchodník odnesl tištěnou smlouvu ke klientovi"
          }
          Icon={Package}
          done={!!contract.pickedUpAt}
        >
          {contract.pickedUpAt ? (
            <button
              type="button"
              onClick={() => unsetMilestone("picked-up")}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-edge px-3 text-[12px] font-medium text-ink-mid transition-colors hover:border-ink-base hover:text-ink-base"
            >
              <Undo2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Zrušit označení
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMilestone("picked-up")}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-ink-base px-4 text-[12px] font-semibold text-paper transition-transform active:translate-y-px"
            >
              <Package className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Označit jako vyzvednuto
            </button>
          )}
        </ActionCard>

        <ActionCard
          step="4"
          title="Naskenovaná kopie"
          subtitle={
            contract.scanUploadedAt
              ? `nahráno ${formatDateTime(contract.scanUploadedAt)}${
                  contract.scanUploadedBy ? ` · ${contract.scanUploadedBy}` : ""
                }`
              : "podepsaná verze klientem"
          }
          Icon={ScanLine}
          done={!!contract.scanPdfUrl}
        >
          <div className="flex flex-wrap items-center gap-2">
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
              className={[
                "inline-flex h-9 items-center gap-2 rounded-full px-4 text-[12px] font-semibold transition-transform active:translate-y-px disabled:opacity-50",
                contract.scanPdfUrl
                  ? "border border-edge bg-paper text-ink-deep hover:border-ink-base hover:text-ink-base"
                  : "bg-ink-base text-paper",
              ].join(" ")}
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
                  href={`/api/portal/contracts/${contract.id}/download/scan`}
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

      {/* Variant switcher (jen pro typy s variantami, např. franšíza) */}
      {hasVariants(contract.type) && (
        <VariantSection
          contract={contract}
          dirty={dirty}
          onSwitched={(updated) => {
            setContract(updated);
            setHtml(updated.html);
            setVariables(updated.variables);
            setSaveState("idle");
            setSaveError(null);
            notify(
              "ok",
              `Šablona přepnuta na variantu ${
                updated.variant
                  ? variantShortLabel(updated.type, updated.variant)
                  : ""
              }.`,
            );
            router.refresh();
          }}
          onError={(msg) => notify("error", msg)}
        />
      )}

      {/* Variables */}
      <section className="flex flex-col gap-7 rounded-2xl border border-edge bg-paper p-5 md:p-6">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-base">
            Hodnoty placeholderů
          </h2>
          <span className="text-[11.5px] text-ink-mid">
            · Pole, která se dosadí při generování. Vlastnosti klienta jsou
            předvyplněné, ostatní doplňte ručně.
          </span>
        </div>

        <FieldGroup label="Smlouva">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SmallField
              label="Místo uzavření"
              value={variables.place ?? ""}
              placeholder="Praha"
              onChange={(v) => updateVar("place", v)}
            />
            <SmallField
              label="Datum uzavření"
              hint="datum účinnosti je stejné"
              value={variables.contractDate ?? ""}
              placeholder="18. května 2026"
              onChange={(v) => updateVar("contractDate", v)}
            />
          </div>
        </FieldGroup>

        {/* Odstoupení od smluv: Manažer i Poskytovatel jsou firmy ze sítě
            BOServices, ne hlavní s.r.o. User je vybírá ze stejných 7 presetů
            jako Dlužníka. Sekce „Zástupci poskytovatele" se neukazuje (na
            odstoupení BOServices nepodepisuje). */}
        {contract.type === "withdrawal" && (
          <>
            <FieldGroup label="Manažer (adresát MS)">
              <CompanyChipPicker
                selectedIco={variables.managerIco}
                onFill={fillManager}
                addLabel="Jiná firma"
                modalEyebrow="Manažer mimo presety"
                modalTitle="Vyhledat firmu v ARES"
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <SmallField
                  label="Manažer - obchodní jméno"
                  value={variables.managerName ?? ""}
                  placeholder="Twistcafe s.r.o."
                  onChange={(v) => updateVar("managerName", v)}
                />
                <SmallField
                  label="Manažer - IČO"
                  value={variables.managerIco ?? ""}
                  placeholder="12345678"
                  onChange={(v) => updateVar("managerIco", v)}
                />
                <SmallField
                  label="Manažer - ulice a č.p."
                  value={variables.managerStreet ?? ""}
                  placeholder="Hlavní 1"
                  onChange={(v) => updateVar("managerStreet", v)}
                />
                <SmallField
                  label="Manažer - obec"
                  value={variables.managerCity ?? ""}
                  placeholder="Praha 1"
                  onChange={(v) => updateVar("managerCity", v)}
                />
                <SmallField
                  label="Manažer - PSČ"
                  value={variables.managerZip ?? ""}
                  placeholder="11000"
                  onChange={(v) => updateVar("managerZip", v)}
                />
              </div>
            </FieldGroup>

            <FieldGroup label="Poskytovatel (adresát FS)">
              <CompanyChipPicker
                selectedIco={variables.providerIco}
                onFill={fillWithdrawalProvider}
                addLabel="Jiná firma"
                modalEyebrow="Poskytovatel mimo presety"
                modalTitle="Vyhledat firmu v ARES"
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <SmallField
                  label="Poskytovatel - obchodní jméno"
                  value={variables.providerName ?? ""}
                  placeholder="Trdlokafe International s.r.o."
                  onChange={(v) => updateVar("providerName", v)}
                />
                <SmallField
                  label="Poskytovatel - IČO"
                  value={variables.providerIco ?? ""}
                  placeholder="12345678"
                  onChange={(v) => updateVar("providerIco", v)}
                />
                <SmallField
                  label="Poskytovatel - ulice a č.p."
                  value={variables.providerStreet ?? ""}
                  placeholder="Hlavní 1"
                  onChange={(v) => updateVar("providerStreet", v)}
                />
                <SmallField
                  label="Poskytovatel - obec"
                  value={variables.providerCity ?? ""}
                  placeholder="Praha 1"
                  onChange={(v) => updateVar("providerCity", v)}
                />
                <SmallField
                  label="Poskytovatel - PSČ"
                  value={variables.providerZip ?? ""}
                  placeholder="11000"
                  onChange={(v) => updateVar("providerZip", v)}
                />
              </div>
            </FieldGroup>
          </>
        )}

        {contract.type !== "withdrawal" && (
          <FieldGroup label="Zástupci poskytovatele (BOServices podepisují vždy 2 jednatelé)">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <SmallField
                label="1. zástupce - jméno"
                value={variables.providerStatutory1Name ?? ""}
                placeholder="Ing. Jiří Slavkovský"
                onChange={(v) => updateVar("providerStatutory1Name", v)}
              />
              <SmallField
                label="1. zástupce - funkce"
                value={variables.providerStatutory1Role ?? ""}
                placeholder="jednatel"
                onChange={(v) => updateVar("providerStatutory1Role", v)}
              />
              <SmallField
                label="2. zástupce - jméno"
                value={variables.providerStatutory2Name ?? ""}
                placeholder="Mgr. Jakub Pešek"
                onChange={(v) => updateVar("providerStatutory2Name", v)}
              />
              <SmallField
                label="2. zástupce - funkce"
                value={variables.providerStatutory2Role ?? ""}
                placeholder="jednatel"
                onChange={(v) => updateVar("providerStatutory2Role", v)}
              />
            </div>
          </FieldGroup>
        )}

        {has("clientBankAccount") && (
          <FieldGroup label="Bankovní účet klienta">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <SmallField
                label="Klient - bankovní účet"
                value={variables.clientBankAccount ?? ""}
                placeholder="1234567890/0100"
                onChange={(v) => updateVar("clientBankAccount", v)}
              />
            </div>
          </FieldGroup>
        )}

        {hasAny([
          "provozovnaAddress",
          "conceptName",
          "franchiseFeePercent",
        ]) && (
          <FieldGroup label="Provozovna">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {has("provozovnaAddress") && (
                <SmallField
                  label="Adresa provozovny"
                  value={variables.provozovnaAddress ?? ""}
                  placeholder="Václavské nám. 1, 110 00 Praha 1"
                  onChange={(v) => updateVar("provozovnaAddress", v)}
                />
              )}
              {has("conceptName") && (
                <SmallField
                  label="Název franšízingového konceptu"
                  value={variables.conceptName ?? ""}
                  placeholder="např. Coffee&Bagels"
                  onChange={(v) => updateVar("conceptName", v)}
                />
              )}
              {has("franchiseFeePercent") && (
                <SmallField
                  label="Franšízový poplatek (%)"
                  value={variables.franchiseFeePercent ?? ""}
                  placeholder="8"
                  onChange={(v) => updateVar("franchiseFeePercent", v)}
                />
              )}
            </div>
          </FieldGroup>
        )}

        {hasAny([
          "debtorName",
          "debtorIco",
          "debtorStreet",
          "debtorCity",
          "debtorZip",
        ]) && (
          <FieldGroup label="Dlužník">
            <DebtorPresetPicker
              selectedIco={variables.debtorIco}
              onFill={(payload) => fillDebtor(payload)}
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {has("debtorName") && (
                <SmallField
                  label="Dlužník - obchodní jméno"
                  value={variables.debtorName ?? ""}
                  placeholder="Dlužník s.r.o."
                  onChange={(v) => updateVar("debtorName", v)}
                />
              )}
              {has("debtorIco") && (
                <SmallField
                  label="Dlužník - IČO"
                  value={variables.debtorIco ?? ""}
                  placeholder="12345678"
                  onChange={(v) => updateVar("debtorIco", v)}
                />
              )}
              {has("debtorStreet") && (
                <SmallField
                  label="Dlužník - ulice a č.p."
                  value={variables.debtorStreet ?? ""}
                  placeholder="Hlavní 1"
                  onChange={(v) => updateVar("debtorStreet", v)}
                />
              )}
              {has("debtorCity") && (
                <SmallField
                  label="Dlužník - obec"
                  value={variables.debtorCity ?? ""}
                  placeholder="Brno"
                  onChange={(v) => updateVar("debtorCity", v)}
                />
              )}
              {has("debtorZip") && (
                <SmallField
                  label="Dlužník - PSČ"
                  value={variables.debtorZip ?? ""}
                  placeholder="60200"
                  onChange={(v) => updateVar("debtorZip", v)}
                />
              )}
            </div>
          </FieldGroup>
        )}

        {hasAny([
          "originContractDate",
          "originContractTitle",
          "totalClaimsAmount",
        ]) && (
          <FieldGroup label="Specifika smlouvy">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {has("originContractDate") && (
                <SmallField
                  label="Datum původní smlouvy"
                  value={variables.originContractDate ?? ""}
                  placeholder="1. ledna 2026"
                  onChange={(v) => updateVar("originContractDate", v)}
                />
              )}
              {has("originContractTitle") && (
                <ChipField
                  label="Předmět původní smlouvy"
                  hint="vyplní se za „ze smlouvy o…"
                  value={variables.originContractTitle ?? ""}
                  onChange={(v) => updateVar("originContractTitle", v)}
                  options={ORIGIN_CONTRACT_TITLE_OPTIONS}
                />
              )}
              {has("totalClaimsAmount") && (
                <SmallField
                  label="Celková výše pohledávek"
                  value={variables.totalClaimsAmount ?? ""}
                  placeholder="1 250 000 Kč"
                  onChange={(v) => updateVar("totalClaimsAmount", v)}
                />
              )}
            </div>
          </FieldGroup>
        )}

        {hasAny([
          "originContractsDate",
          "withdrawalLocation",
          "leaseLostDate",
          "ksDropClause",
          "ksPreservedClause",
        ]) && (
          <FieldGroup label="Specifika odstoupení">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {has("originContractsDate") && (
                <SmallField
                  label="Datum uzavření MS+FS (+KS)"
                  value={variables.originContractsDate ?? ""}
                  placeholder="1. ledna 2026"
                  onChange={(v) => updateVar("originContractsDate", v)}
                />
              )}
              {has("withdrawalLocation") && (
                <SmallField
                  label="Lokace (předmět smluv)"
                  hint="koncept + adresa"
                  value={variables.withdrawalLocation ?? ""}
                  placeholder="Kytky od Pepy Štefánikova Praha"
                  onChange={(v) => updateVar("withdrawalLocation", v)}
                />
              )}
              {(has("ksDropClause") || has("ksPreservedClause")) && (
                <ChipField
                  label="Kupní smlouva (KS)"
                  hint="jak se ke KS chovat v dokumentu"
                  value={detectKsMode(variables)}
                  onChange={(mode) => setKsMode(mode)}
                  options={KS_MODE_OPTIONS}
                />
              )}
              {has("leaseLostDate") && (
                <SmallField
                  label="Datum ztráty nájmu (var. B)"
                  value={variables.leaseLostDate ?? ""}
                  placeholder="1. dubna 2026"
                  onChange={(v) => updateVar("leaseLostDate", v)}
                />
              )}
            </div>
          </FieldGroup>
        )}

        <div className="border-t border-edge pt-4 text-[11px] text-ink-mid">
          Číslo smlouvy{" "}
          <span className="font-mono text-ink-base">
            {contract.number ?? "—"}
          </span>{" "}
          je přiřazeno automaticky a nelze upravit.
        </div>
      </section>

      {/* Editor */}
      <section>
        <div className="mb-3 flex items-baseline gap-2.5">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-base">
            {isBundle ? "Znění balíčku" : "Znění smlouvy"}
          </h2>
          <span className="text-[11.5px] text-ink-mid">
            ·{" "}
            {isBundle
              ? "Tři dokumenty pod sebou. Placeholdery se vyplňují společně nahoře. Vložení placeholderu z palety jde do naposledy zaměřeného editoru."
              : "Editujte text. Placeholdery se nahradí hodnotami nahoře."}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
          <div className="flex min-w-0 flex-col gap-5">
            {isBundle ? (
              bundleSections.map((section, idx) => (
                <BundleSectionEditor
                  key={section.type}
                  index={idx}
                  total={bundleSections.length}
                  section={section}
                  isActive={idx === activeBundleIdx}
                  onChange={(next) => updateBundleSection(idx, next)}
                  onFocus={() => setActiveBundleIdx(idx)}
                  editorRef={(e) => {
                    bundleEditorRefs.current[idx] = e;
                  }}
                />
              ))
            ) : (
              <TiptapEditor
                value={html}
                onChange={updateHtml}
                editorRef={(e) => (editorRef.current = e)}
              />
            )}
          </div>
          <aside className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-2xl border border-edge bg-paper-warm lg:sticky lg:top-6">
            <div className="flex-1 overflow-y-auto p-4">
              <PlaceholderPalette onInsert={handleInsert} />
              {isBundle && (
                <div className="mt-4 rounded-lg border border-edge bg-paper p-3 text-[11px] leading-relaxed text-ink-mid">
                  Aktivní editor:{" "}
                  <span className="font-semibold text-ink-base">
                    {bundleSections[activeBundleIdx]
                      ? CONTRACT_TYPE_META[
                          bundleSections[activeBundleIdx]!.type
                        ].shortName
                      : "—"}
                  </span>
                </div>
              )}
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

      {diffOpen && (
        <DiffModal
          contractId={contract.id}
          onClose={() => setDiffOpen(false)}
        />
      )}
    </div>
  );
}

function BundleSectionEditor({
  index,
  total,
  section,
  isActive,
  onChange,
  onFocus,
  editorRef,
}: {
  index: number;
  total: number;
  section: BundleSection;
  isActive: boolean;
  onChange: (next: string) => void;
  onFocus: () => void;
  editorRef: (e: Editor | null) => void;
}) {
  const sectionMeta = CONTRACT_TYPE_META[section.type];
  const changed = section.templateSnapshot !== section.html;
  return (
    <div
      onFocusCapture={onFocus}
      className={[
        "flex flex-col gap-3 rounded-2xl border bg-paper p-4 transition-colors md:p-5",
        isActive ? "border-ink-base shadow-[0_18px_42px_-28px_rgba(14,14,14,0.28)]" : "border-edge",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10.5px] text-ink-soft">
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
          <h3 className="text-[14px] font-bold tracking-[-0.01em] text-ink-base">
            {sectionMeta.fullName}
          </h3>
        </div>
        <span
          className={[
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-medium",
            changed
              ? "bg-ink-base text-paper"
              : "bg-paper-warm text-ink-mid",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-1.5 w-1.5 rounded-full",
              changed ? "bg-paper" : "bg-ink-soft",
            ].join(" ")}
          />
          {changed ? "Upraveno proti šabloně" : "Beze změn proti šabloně"}
        </span>
      </div>
      <TiptapEditor
        value={section.html}
        onChange={onChange}
        editorRef={editorRef}
      />
    </div>
  );
}

function DiffSection({
  hasChanges,
  onOpen,
  diffPdfUrl,
}: {
  hasChanges: boolean;
  onOpen: () => void;
  diffPdfUrl: string;
}) {
  if (!hasChanges) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-edge bg-paper-warm px-3 py-1.5 text-[11px] text-ink-mid">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-soft" />
        Beze změn proti šabloně
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-base bg-paper px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-base">
        <FileWarning className="h-3.5 w-3.5" strokeWidth={1.5} />
        Smlouva se liší od šablony
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-edge bg-paper px-3 text-[11.5px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
      >
        Přehled změn
      </button>
      <a
        href={diffPdfUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink-base px-3 text-[11.5px] font-semibold text-paper"
      >
        <Download className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
        PDF s úpravami
      </a>
    </div>
  );
}

type DiffSectionPayload = {
  type: ContractType;
  hasChanges: boolean;
  changeCount: number;
  diffHtml: string;
};

function DiffModal({
  contractId,
  onClose,
}: {
  contractId: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | {
        kind: "ok";
        diffHtml: string;
        count: number;
        sections?: DiffSectionPayload[];
      }
    | { kind: "error"; msg: string }
  >({ kind: "loading" });
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/portal/contracts/${contractId}/diff`);
        const data = await res.json();
        if (!alive) return;
        if (!data.ok) {
          setState({ kind: "error", msg: data.error ?? "Chyba" });
          return;
        }
        setState({
          kind: "ok",
          diffHtml: data.diffHtml,
          count: data.changeCount,
          sections: data.sections,
        });
        setActiveTab(0);
      } catch (err) {
        if (alive) {
          setState({
            kind: "error",
            msg: err instanceof Error ? err.message : "Chyba",
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [contractId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-8 backdrop-blur-sm md:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex w-full max-w-[920px] flex-col rounded-2xl border border-edge bg-paper shadow-[0_24px_60px_-20px_rgba(14,14,14,0.35)]">
        <div className="flex items-start justify-between gap-4 border-b border-edge p-6">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              Přehled změn
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Smlouva vs. šablona
            </h2>
            {state.kind === "ok" && (
              <p className="mt-1 text-[12px] text-ink-mid">
                {state.count}{" "}
                {state.count === 1
                  ? "změna"
                  : state.count < 5
                    ? "změny"
                    : "změn"}{" "}
                · červené škrtnutí = původní text ze šablony, červené
                podtržení = aktuální text smlouvy.
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        {state.kind === "ok" && state.sections && state.sections.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-edge px-6 pb-px">
            {state.sections.map((section, i) => {
              const active = i === activeTab;
              return (
                <button
                  key={section.type}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={[
                    "relative inline-flex h-11 items-center gap-2 whitespace-nowrap px-4 text-[12.5px] font-medium transition-colors",
                    active
                      ? "text-ink-base"
                      : "text-ink-mid hover:text-ink-base",
                  ].join(" ")}
                >
                  {CONTRACT_TYPE_META[section.type].shortName}
                  {section.hasChanges && (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-ink-base px-1.5 text-[10px] font-semibold text-paper">
                      {section.changeCount}
                    </span>
                  )}
                  {active && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink-base" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="max-h-[70vh] overflow-y-auto p-6 md:p-8">
          {state.kind === "loading" && (
            <div className="text-[13px] text-ink-mid">Načítám změny…</div>
          )}
          {state.kind === "error" && (
            <div role="alert" className="text-[13px] text-ink-deep">
              {state.msg}
            </div>
          )}
          {state.kind === "ok" && (
            <>
              {state.sections && state.sections.length > 0 ? (
                state.sections[activeTab]?.hasChanges ? (
                  <div
                    className="diff-view"
                    dangerouslySetInnerHTML={{
                      __html: state.sections[activeTab]!.diffHtml,
                    }}
                  />
                ) : (
                  <div className="rounded-2xl border border-edge bg-paper-warm px-5 py-6 text-[13px] text-ink-mid">
                    Tato sekce se od šablony neliší.
                  </div>
                )
              ) : (
                <div
                  className="diff-view"
                  dangerouslySetInnerHTML={{ __html: state.diffHtml }}
                />
              )}
            </>
          )}
        </div>

        <style jsx global>{`
          .diff-view {
            font-size: 14px;
            line-height: 1.65;
            color: var(--color-ink-base);
          }
          .diff-view h1, .diff-view h2, .diff-view h3 {
            font-weight: 700;
            margin-top: 1.25em;
          }
          .diff-view h1 { font-size: 1.4rem; }
          .diff-view h2 { font-size: 1.1rem; border-bottom: 1px solid var(--color-edge); padding-bottom: 0.3em; }
          .diff-view h3 { font-size: 1rem; }
          .diff-view p { margin: 0.5em 0; }
          .diff-view ol, .diff-view ul { padding-left: 1.5em; margin: 0.5em 0; }
          .diff-view ol { list-style: decimal; }
          .diff-view ul { list-style: disc; }
          .diff-view ins {
            background: rgba(220, 38, 38, 0.10);
            color: #B91C1C;
            text-decoration: underline;
            text-decoration-thickness: 1.5px;
            text-underline-offset: 3px;
            padding: 0 2px;
            border-radius: 2px;
          }
          .diff-view del {
            background: rgba(220, 38, 38, 0.06);
            color: #B91C1C;
            text-decoration: line-through;
            text-decoration-thickness: 1.5px;
            padding: 0 2px;
            border-radius: 2px;
          }
        `}</style>
      </div>
    </div>
  );
}

function ActionCard({
  step,
  title,
  subtitle,
  Icon,
  done,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "relative flex flex-col gap-4 rounded-2xl border bg-paper p-5",
        done ? "border-ink-base" : "border-edge",
      ].join(" ")}
    >
      {done && (
        <div className="absolute right-4 top-4 grid h-6 w-6 place-items-center rounded-full bg-ink-base text-paper">
          <CheckCircle2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        </div>
      )}
      <div className="flex items-start gap-3">
        <div
          className={[
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
            done ? "bg-ink-base text-paper" : "bg-edge-warm text-ink-deep",
          ].join(" ")}
        >
          <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div className="flex-1 pr-7">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10.5px] text-ink-soft">{step}</span>
            <span className="text-[14px] font-bold tracking-[-0.01em] text-ink-base">
              {title}
            </span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-mid">{subtitle}</div>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

const ORIGIN_CONTRACT_TITLE_OPTIONS: ChipOption[] = [
  { label: "Franšízingová smlouva", value: "franšíze" },
  { label: "Kupní smlouva", value: "koupi zboží" },
];

const KS_MODE_OPTIONS: ChipOption[] = [
  { label: "KS padá s ostatními", value: "dropped" },
  { label: "KS zůstává v platnosti", value: "preserved" },
];

// Z dvojice hodnot (ksDropClause + ksPreservedClause) odvodí aktuální mode.
// Pokud má ksDropClause obsah, KS „padá"; jinak (ksPreservedClause má obsah)
// KS „zůstává v platnosti". Default = dropped.
function detectKsMode(variables: Record<string, string>): string {
  const drop = variables.ksDropClause ?? "";
  const preserved = variables.ksPreservedClause ?? "";
  if (preserved.trim() && !drop.trim()) return "preserved";
  return "dropped";
}

type ChipOption = { label: string; value: string };

function ChipField({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: ChipOption[];
}) {
  // Aktivní chip = chip, jehož stored value se shoduje s aktuální hodnotou pole.
  // Pokud uživatel ručně dopsal něco jiného, žádný chip není aktivní.
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-baseline gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
        <span>{label}</span>
        {hint && (
          <span className="normal-case tracking-normal text-[10px] text-ink-soft">
            · {hint}
          </span>
        )}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className={[
                "inline-flex h-9 items-center rounded-full border px-3.5 text-[12.5px] font-medium transition-all",
                active
                  ? "border-ink-base bg-ink-base text-paper"
                  : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
              ].join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SmallField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
        <span>{label}</span>
        {hint && (
          <span className="normal-case tracking-normal text-[10px] text-ink-soft">
            · {hint}
          </span>
        )}
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

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
        {label}
      </div>
      {children}
    </div>
  );
}

function SaveIndicator({
  state,
  error,
}: {
  state: SaveState;
  error: string | null;
}) {
  if (state === "idle") return null;
  const cls =
    "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[12.5px] font-medium";
  if (state === "pending" || state === "saving") {
    return (
      <span className={`${cls} border-edge bg-paper text-ink-mid`}>
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-soft" />
        Ukládám…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span
        className={`${cls} border-ink-base bg-ink-base text-paper`}
        title={error ?? undefined}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-paper" />
        Neuloženo
      </span>
    );
  }
  return (
    <span className={`${cls} border-edge bg-paper text-ink-deep`}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-base" />
      Uloženo
    </span>
  );
}

function VariantSection({
  contract,
  dirty,
  onSwitched,
  onError,
}: {
  contract: Contract;
  dirty: boolean;
  onSwitched: (c: Contract) => void;
  onError: (msg: string) => void;
}) {
  const current = contract.variant;
  const [pending, setPending] = useState<ContractVariant | null>(null);
  const [confirmFor, setConfirmFor] = useState<ContractVariant | null>(null);
  const variants = getVariantsForType(contract.type);

  async function doSwitch(target: ContractVariant) {
    setPending(target);
    setConfirmFor(null);
    try {
      const res = await fetch(`/api/portal/contracts/${contract.id}/variant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant: target }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Přepnutí selhalo.");
      onSwitched(data.contract);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Přepnutí selhalo.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-edge bg-paper p-5 md:p-6">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-base">
          Varianta šablony
        </h2>
        <span className="text-[11.5px] text-ink-mid">
          · Která verze smlouvy se použije.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {variants.map((v) => {
          const meta = getVariantMeta(contract.type, v);
          if (!meta) return null;
          const variant = v as ContractVariant;
          const active = variant === current;
          const isPending = pending === variant;
          return (
            <button
              key={v}
              type="button"
              disabled={active || pending !== null}
              onClick={() => {
                if (active) return;
                if (dirty) {
                  setConfirmFor(variant);
                } else {
                  void doSwitch(variant);
                }
              }}
              className={[
                "flex flex-col gap-1 rounded-lg border px-3.5 py-3 text-left transition-all disabled:cursor-default",
                active
                  ? "border-ink-base bg-ink-base text-paper"
                  : "border-edge bg-paper text-ink-deep hover:border-ink-soft disabled:opacity-60",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-semibold tracking-[-0.01em]">
                  {meta.label}
                </span>
                {active && (
                  <span className="rounded-full bg-paper/15 px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.14em] text-paper">
                    Aktivní
                  </span>
                )}
                {isPending && (
                  <span className="text-[11px] text-ink-soft">přepínám…</span>
                )}
              </span>
              <span
                className={`text-[11.5px] leading-snug ${
                  active ? "text-paper/65" : "text-ink-mid"
                }`}
              >
                {meta.description}
              </span>
            </button>
          );
        })}
      </div>

      {confirmFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-base/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[440px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)]">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              Pozor
            </div>
            <h3 className="mt-1 text-[16px] font-bold leading-[1.25] tracking-[-0.02em] text-ink-base">
              Přepsat smlouvu novou šablonou?
            </h3>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-mid">
              Přepnutím na variantu <strong>{variantShortLabel(contract.type, confirmFor)}</strong> dojde k
              přepsání aktuálního znění smlouvy textem nové šablony. Veškeré
              vlastní úpravy v editoru budou ztraceny.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmFor(null)}
                className="h-10 rounded-full px-4 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={() => doSwitch(confirmFor)}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px"
              >
                Přepnout a přepsat
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
