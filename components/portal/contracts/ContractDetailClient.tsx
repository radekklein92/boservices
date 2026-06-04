"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import dynamicImport from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Lock,
  RefreshCw,
  Save,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import {
  isContractEditable,
  type BundleSection,
  type Contract,
} from "@/lib/portal/contracts-db";
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
import {
  extractPlaceholderTokens,
  resolvePlaceholderValue,
  setBakedValue,
} from "@/lib/portal/contract-render";
import {
  computeClaimsTotal,
  formatClaimsTotalAmount,
  type ClaimItem,
} from "@/lib/portal/claims";
import { checkInsolvencyAny, safeContractDate } from "@/lib/portal/insolvency-rules";
import { signerFunctionLabel } from "@/lib/portal/users-db";
import { PlaceholderPalette } from "./PlaceholderPalette";
import { ClaimsBuilder } from "./ClaimsBuilder";

// Tiptap editor (~350KB gzip s extensions) lazy-loaded přes next/dynamic.
// Bez ssr=false, protože editor potřebuje DOM. loading: vrátí stylovaný
// skeleton, aby uživatel nečekal s prázdným místem.
const TiptapEditor = dynamicImport(
  () => import("./TiptapEditor").then((m) => m.TiptapEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-xl bg-edge-warm" />
    ),
  },
);
import {
  DebtorPresetPicker,
  type DebtorFillPayload,
} from "./DebtorPresetPicker";
import {
  CompanyChipPicker,
  type CompanyFillPayload,
} from "./CompanyChipPicker";
import { ContractStatusStepper } from "./ContractStatusStepper";
import { ContractCurrentActionPanel } from "./ContractCurrentActionPanel";
import { ContractApprovalPanel } from "./ContractApprovalPanel";
import { BackLink } from "@/components/portal/ui/BackLink";

import { TemplateMatchBadge } from "./TemplateMatchBadge";
import { DiffModal } from "./DiffModal";
import { isApprovalGated } from "@/lib/portal/contract-types";
import { LEASE_HOLDERS } from "@/lib/portal/lease-holders";

type Props = {
  initial: Contract;
  // Server-snapshot: je aktuálně šablona / všechny sub-šablony schválené?
  // Pokud ne → červený badge "Šablona neschválená" v hlavičce.
  templateApproved: boolean;
  // Aktuální uživatel je schvalovatel šablon (vidí "Schválit" u Ke schválení).
  isApprover: boolean;
  // Superadmin smí schválit i bez role schvalovatele - ale s povinnou poznámkou.
  isSuperadmin: boolean;
  // E-maily všech schvalovatelů (tooltip u "Připomenout e-mailem").
  approverEmails: string[];
  // NewCo údaje vybrané lokality pro panel schválení. null = smlouva nemá
  // vybranou lokalitu. inFile = lokalita se vůbec nachází v importovaném NEWCO.
  locationNewco?: {
    inFile: boolean;
    entitaCeip1: string;
    operationalType: string;
  } | null;
  // Standardní odměna z aktivní šablony (raw částka) - baseline pro detekci
  // ruční změny u cooperation/operation. Franšíza ji nepoužívá.
  standardOperatingFee?: string | null;
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

export function ContractDetailClient({
  initial,
  templateApproved,
  isApprover,
  isSuperadmin,
  approverEmails,
  locationNewco = null,
  standardOperatingFee = null,
}: Props) {
  const router = useRouter();
  const [contract, setContract] = useState(initial);
  const [html, setHtml] = useState(initial.html);
  const [bundleSections, setBundleSections] = useState<BundleSection[]>(
    initial.bundleSections ?? [],
  );
  const [variables, setVariables] = useState(initial.variables);
  const [claims, setClaims] = useState<ClaimItem[]>(initial.claims ?? []);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [genPending, setGenPending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [leaseHolderPending, setLeaseHolderPending] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  // Kontrola úpadku dlužníka: klíč naposledy ignorovaného upozornění (rule|datum).
  const [insolvencyDismissed, setInsolvencyDismissed] = useState<string | null>(
    null,
  );
  // Display name + funkce vybraného Podepisujícího (pro zobrazení ve stepperu).
  // Fetchne se on-demand z /api/portal/users/[email] když je contract.signerEmail.
  const [signerLabel, setSignerLabel] = useState<string | null>(null);
  // Pro bundle: index aktuálně fokusovaného editoru - kam se vkládají placeholdery.
  const [activeBundleIdx, setActiveBundleIdx] = useState(0);
  const editorRef = useRef<Editor | null>(null);
  const bundleEditorRefs = useRef<(Editor | null)[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(false);

  const isBundle = isBundleType(contract.type);
  // Od stavu „schváleno" dál je smlouva uzamčená proti úpravám obsahu.
  const locked = !isContractEditable(contract.status);
  const dirty = saveState === "pending" || saveState === "saving";

  // Template changes detection - pro bundle agreguje napříč sekcemi.
  const hasTemplateChanges = isBundle
    ? bundleSections.some(
        (s) => s.templateSnapshot && s.templateSnapshot !== s.html,
      )
    : !!contract.templateSnapshot && contract.templateSnapshot !== html;

  const meta = CONTRACT_TYPE_META[contract.type as ContractType];

  // Placeholder tokens - pro bundle scanuje všechny sekce, jinak single html.
  // Pole hodnot gateujeme podle tokenů v ŠABLONĚ (templateSnapshot) - stabilní
  // i po zapečení placeholderů do textu (kde už tokeny nejsou).
  const usedTokens = useMemo(() => {
    if (isBundle) {
      const set = new Set<string>();
      for (const section of bundleSections) {
        for (const token of extractPlaceholderTokens(
          section.templateSnapshot ?? section.html,
        )) {
          set.add(token);
        }
      }
      return set;
    }
    return extractPlaceholderTokens(contract.templateSnapshot ?? html);
  }, [isBundle, contract.templateSnapshot, html, bundleSections]);
  const has = (token: string) => usedTokens.has(token);
  // Výběr firmy držící nájem - jen franšíza varianty B + nájem na třetí stranu.
  const showLeaseHolder =
    contract.type === "franchise" &&
    contract.variant === "B" &&
    contract.locationSnapshot?.leaseStatus === "prepis_jinam";
  const hasAny = (tokens: string[]) => tokens.some((t) => usedTokens.has(t));
  // Editor seznamu pohledávek (Příloha č. 1) - POUZE pro postoupení pohledávek.
  // Vázáno striktně na typ smlouvy, ne na přítomnost tokenu {{claimsTable}} -
  // jiné šablony (např. provozování provozovny) mohou token obsahovat, ale
  // panel pohledávek tam nepatří.
  const showClaims =
    contract.type === "claim-assignment" ||
    contract.type === "claim-bundle";

  // Úpadek dlužníka: když je datum uzavření v den úpadku nebo po něm, vzniká
  // zapodstatová pohledávka -> upozornění (lze ignorovat na vlastní odpovědnost).
  // Pouze odstoupení a pouze podle MANAŽERA (Poskytovatel se neřeší).
  const insolvencyRule = useMemo(
    () =>
      contract.type === "withdrawal"
        ? checkInsolvencyAny([variables.managerName], variables.contractDate)
        : null,
    [contract.type, variables.managerName, variables.contractDate],
  );
  const insolvencyKey = insolvencyRule
    ? `${insolvencyRule.match}|${variables.contractDate ?? ""}`
    : null;
  const insolvencyOpen =
    !!insolvencyRule && insolvencyKey !== insolvencyDismissed;

  function notify(kind: "ok" | "error", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 3500);
  }

  function markDirty() {
    // Uzamčená smlouva (schváleno a dál) se neukládá - editace je vypnutá,
    // tohle je jen pojistka, kdyby přesto přišel update.
    if (locked) return;
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
  // Promítne změny hodnot do zapečeného textu (značky data-ph). U bundle se
  // nezapéká, takže no-op. KEEP_DYNAMIC tokeny (ks*, claimsTable) nemají span.
  function applyBakedValues(changes: Record<string, string>) {
    if (isBundle) return;
    setHtml((prev) => {
      let out = prev;
      for (const [k, v] of Object.entries(changes)) {
        out = setBakedValue(out, k, v);
      }
      return out;
    });
  }
  function updateVar(key: string, value: string) {
    const changes: Record<string, string> =
      key === "contractDate"
        ? { contractDate: value, effectiveDate: value }
        : { [key]: value };
    setVariables((prev) => ({ ...prev, ...changes }));
    applyBakedValues(changes);
    markDirty();
  }
  // Firma držící nájem (franšíza B + nájem na třetí stranu) - přepíše čl. III
  // odst. 1 v textu na serveru a srovná editor.
  async function pickLeaseHolder(company: string) {
    setLeaseHolderPending(true);
    try {
      const res = await fetch(
        `/api/portal/contracts/${contract.id}/lease-holder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company: company || null }),
        },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      const r = await fetch(`/api/portal/contracts/${contract.id}`);
      const j = await r.json();
      if (j.ok) {
        setContract(j.contract);
        setHtml(j.contract.html);
        setVariables(j.contract.variables);
      }
      notify("ok", "Nájemce uložen.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setLeaseHolderPending(false);
    }
  }
  function updateClaims(next: ClaimItem[]) {
    setClaims(next);
    // Součet (vč. DPH) se promítne do {{totalClaimsAmount}} v těle smlouvy.
    // Prázdný seznam -> prázdná hodnota (placeholder zůstane zvýrazněný k doplnění).
    const total =
      computeClaimsTotal(next) > 0 ? formatClaimsTotalAmount(next) : "";
    setVariables((prev) => ({ ...prev, totalClaimsAmount: total }));
    markDirty();
  }
  function fillDebtor(payload: DebtorFillPayload) {
    setVariables((prev) => ({ ...prev, ...payload }));
    applyBakedValues(payload as unknown as Record<string, string>);
    markDirty();
    notify("ok", `Dlužník vyplněn: ${payload.debtorName || payload.debtorIco}.`);
  }
  function fillManager(p: CompanyFillPayload) {
    const changes: Record<string, string> = {
      managerName: p.name,
      managerIco: p.ico,
      managerStreet: p.street,
      managerCity: p.city,
      managerZip: p.zip,
    };
    // Manažer v úpadku -> Datum uzavření defaultně 3 dny před úpadkem (bezpečné).
    const safe = safeContractDate([p.name]);
    const datedToSafe: string | null = safe ?? null;
    if (safe) {
      changes.contractDate = safe;
      changes.effectiveDate = safe;
    }
    setVariables((prev) => ({ ...prev, ...changes }));
    applyBakedValues(changes);
    markDirty();
    notify(
      "ok",
      datedToSafe
        ? `Manažer vyplněn: ${p.name || p.ico}. Datum uzavření nastaveno na ${datedToSafe} (před úpadkem).`
        : `Manažer vyplněn: ${p.name || p.ico}.`,
    );
  }
  function fillWithdrawalProvider(p: CompanyFillPayload) {
    // Validace ani úprava data se Poskytovatele netýká - jen vyplníme pole.
    const changes: Record<string, string> = {
      providerName: p.name,
      providerIco: p.ico,
      providerStreet: p.street,
      providerCity: p.city,
      providerZip: p.zip,
    };
    setVariables((prev) => ({ ...prev, ...changes }));
    applyBakedValues(changes);
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
    // Znění je zapečené (vyplněné hodnoty) - vkládáme rovnou hodnotu, ne token.
    editor
      .chain()
      .focus()
      .insertContent(resolvePlaceholderValue(token, variables))
      .run();
  }

  async function performSave(
    htmlSnapshot: string,
    variablesSnapshot: Record<string, string>,
    bundleSnapshot: BundleSection[],
    claimsSnapshot: ClaimItem[],
  ) {
    setSaveState("saving");
    try {
      const body: Record<string, unknown> = {
        variables: variablesSnapshot,
        claims: claimsSnapshot,
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

  // Fetch signer label kdykoliv se změní signerEmail - pro zobrazení ve stepperu.
  // Používá /api/portal/signers, ne /api/portal/users (ten je admin-only,
  // běžní uživatelé by 403, label by se nezobrazil).
  useEffect(() => {
    if (!contract.signerEmail) {
      setSignerLabel(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/signers", { cache: "no-store" });
        const data = await res.json();
        if (cancelled || !data.ok) return;
        const user = (data.signers as Array<{
          email: string;
          name: string;
          signerDisplayName?: string;
          signerFunction?: "jednatel" | "power-of-attorney";
        }>).find((u) => u.email === contract.signerEmail);
        if (user) {
          const name = user.signerDisplayName?.trim() || user.name;
          const fn = user.signerFunction ? signerFunctionLabel(user.signerFunction) : "";
          setSignerLabel(fn ? `${name} · ${fn}` : name);
        } else {
          setSignerLabel(contract.signerEmail ?? null);
        }
      } catch {
        if (!cancelled) setSignerLabel(contract.signerEmail ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contract.signerEmail]);

  useEffect(() => {
    if (saveState !== "pending") return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const htmlSnap = html;
    const varsSnap = variables;
    const bundleSnap = bundleSections;
    const claimsSnap = claims;
    saveTimerRef.current = window.setTimeout(() => {
      performSave(htmlSnap, varsSnap, bundleSnap, claimsSnap);
    }, 800);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, variables, bundleSections, claims, saveState]);

  async function ensureSaved() {
    if (saveState === "pending" || saveState === "saving") {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      await performSave(html, variables, bundleSections, claims);
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

  // setMilestone/unsetMilestone/uploadScan/removeScan logika přesunutá
  // do ContractCurrentActionPanel - viz panel.

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
        <BackLink href="/portal/contracts">Smlouvy</BackLink>
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
            {!templateApproved && (
              <Link
                href="/portal/templates"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-red-600 bg-red-600 px-5 text-[13px] font-semibold text-paper shadow-[0_1px_2px_rgba(220,38,38,0.18)] transition-transform active:translate-y-px"
                title="Šablona použitá na této smlouvě čeká na schválení"
              >
                <AlertTriangle
                  className="h-3.5 w-3.5"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                Šablona neschválená
              </Link>
            )}
            <TemplateMatchBadge
              hasChanges={hasTemplateChanges}
              onOpenDiff={() => setDiffOpen(true)}
            />
            {contract.generatedPdfUrl && (
              <a
                href={`/api/portal/contracts/${contract.id}/download/generated`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-edge bg-paper px-5 text-[13px] font-semibold text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                Stáhnout PDF
              </a>
            )}
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

      {/* Stav smlouvy + aktuální akce */}
      <ContractStatusStepper contract={contract} signerLabel={signerLabel} />
      <ContractCurrentActionPanel
        contract={contract}
        onChanged={(next) => setContract(next)}
        notify={notify}
        isApprover={isApprover}
        isSuperadmin={isSuperadmin}
        locationNewco={locationNewco}
      />

      {/* Lokalita a schválení (jen typy posuzované podle lokality) */}
      {isApprovalGated(contract.type) && (
        <ContractApprovalPanel
          contract={contract}
          isApprover={isApprover}
          isSuperadmin={isSuperadmin}
          approverEmails={approverEmails}
          locationNewco={locationNewco}
          standardOperatingFee={standardOperatingFee}
          onChanged={(next) => {
            // Akce panelu (např. výběr firmy u nájmu) mohou přepsat znění
            // smlouvy - srovnáme i stav editoru.
            setContract(next);
            setHtml(next.html);
            setVariables(next.variables);
          }}
          notify={notify}
        />
      )}

      {locked && (
        <div className="flex items-start gap-3 rounded-2xl border border-edge bg-paper-warm px-5 py-4 text-[13px] text-ink-mid">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>
            Smlouva je schválená a <strong className="text-ink-deep">uzamčená proti úpravám</strong>{" "}
            obsahu. Pro úpravy nejdřív zrušte schválení v panelu „Co teď" výše.
          </span>
        </div>
      )}

      {/* Editovatelná oblast - od stavu „schváleno" dál uzamčená (fieldset
          disabled vypne všechna pole/tlačítka, editor je read-only). */}
      <fieldset disabled={locked} className="contents">
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

        {insolvencyRule && (
          <div className="flex items-start gap-3 rounded-xl border border-red-600 bg-red-50 px-4 py-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
              strokeWidth={2}
              aria-hidden="true"
            />
            <div className="flex-1 text-[12.5px] leading-relaxed text-red-700">
              <strong>Datum po úpadku.</strong> Datum uzavření ({variables.contractDate}){" "}
              je v den úpadku společnosti {insolvencyRule.label}{" "}
              ({insolvencyRule.insolvencyDateLabel}) nebo po něm - vzniká pohledávka
              za majetkovou podstatou (zapodstatová pohledávka).
            </div>
            {insolvencyKey === insolvencyDismissed && (
              <button
                type="button"
                onClick={() => setInsolvencyDismissed(null)}
                className="shrink-0 text-[12px] font-semibold text-red-700 underline underline-offset-2"
              >
                Zobrazit
              </button>
            )}
          </div>
        )}

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
          <FieldGroup label="Zástupce poskytovatele">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <SmallField
                label="Jméno"
                value={variables.providerStatutory1Name ?? ""}
                placeholder="Ing. Jiří Slavkovský"
                onChange={(v) => updateVar("providerStatutory1Name", v)}
              />
              <SmallField
                label="Funkce"
                value={variables.providerStatutory1Role ?? ""}
                placeholder="jednatel"
                onChange={(v) => updateVar("providerStatutory1Role", v)}
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

        {showLeaseHolder && (
          <FieldGroup label="Nájem provozovny">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] leading-snug text-ink-mid">
                Nájem je „na třetí stranu" - vyberte firmu, která drží nájem
                (přepíše čl. III odst. 1 o podnájmu).
              </span>
              <select
                value={variables.leaseHolderCompany ?? ""}
                onChange={(e) => pickLeaseHolder(e.target.value)}
                disabled={leaseHolderPending}
                className="h-10 w-full max-w-sm rounded-lg border border-edge bg-paper px-2.5 text-[13px] text-ink-base outline-none transition-colors focus:border-ink-base disabled:opacity-50"
              >
                <option value="">— Poskytovatel (základní znění) —</option>
                {Object.values(LEASE_HOLDERS).map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </select>
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
              {has("totalClaimsAmount") && !showClaims && (
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

      {/* Příloha č. 1 - seznam pohledávek (postoupení pohledávek) */}
      {showClaims && (
        <ClaimsBuilder claims={claims} onChange={updateClaims} />
      )}

      {/* Editor */}
      <section>
        <div className="mb-3 flex items-baseline gap-2.5">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-base">
            {isBundle ? "Znění balíčku" : "Znění smlouvy"}
          </h2>
          <span className="text-[11.5px] text-ink-mid">
            ·{" "}
            {locked
              ? "Jen pro čtení — smlouva je uzamčená. Placeholdery se nahrazují hodnotami nahoře."
              : isBundle
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
                  editable={!locked}
                />
              ))
            ) : (
              <TiptapEditor
                value={html}
                onChange={updateHtml}
                editorRef={(e) => (editorRef.current = e)}
                editable={!locked}
              />
            )}
          </div>
          <aside className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-2xl border border-edge bg-paper-warm lg:sticky lg:top-6">
            <div className="flex-1 overflow-y-auto p-4">
              <PlaceholderPalette
                onInsert={handleInsert}
                resolveValue={
                  isBundle
                    ? undefined
                    : (t) => resolvePlaceholderValue(t, variables)
                }
              />
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
      </fieldset>

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

      {insolvencyOpen && insolvencyRule && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-base/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[470px] rounded-2xl border border-red-600 bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)]">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Upozornění
            </div>
            <h3 className="mt-2 text-[17px] font-bold leading-[1.2] tracking-[-0.02em] text-ink-base">
              Datum je po úpadku společnosti
            </h3>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
              Datum uzavření <strong>{variables.contractDate}</strong> je v den úpadku
              společnosti <strong>{insolvencyRule.label}</strong>{" "}
              ({insolvencyRule.insolvencyDateLabel}) nebo po něm. Postoupením v tento
              okamžik vzniká <strong>pohledávka za majetkovou podstatou (zapodstatová
              pohledávka)</strong>. Zkontroluj datum uzavření a dlužníka.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  insolvencyKey && setInsolvencyDismissed(insolvencyKey)
                }
                className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px"
              >
                Ignorovat a pokračovat
              </button>
            </div>
          </div>
        </div>
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
  editable = true,
}: {
  index: number;
  total: number;
  section: BundleSection;
  isActive: boolean;
  onChange: (next: string) => void;
  onFocus: () => void;
  editorRef: (e: Editor | null) => void;
  editable?: boolean;
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
        editable={editable}
      />
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
