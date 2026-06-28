"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  Lock,
  Paperclip,
  Trash2,
  Upload,
  FileText,
  ExternalLink,
  AlertTriangle,
  ArrowUpRight,
  Building2,
} from "lucide-react";
import type { LocationView } from "@/lib/portal/locations-db";
import type { ContractStatus } from "@/lib/portal/contracts-db";
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_STYLE,
} from "@/lib/portal/contracts-db";
import type { ContractType } from "@/lib/portal/contract-types";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
import type { ContractFeeTerms } from "@/lib/portal/contract-fee-terms";
import { LocationFeeTermsSection } from "./LocationFeeTerms";
import { FeeHistorySection } from "@/components/portal/fees/FeeHistorySection";
import type { FeeHistoryEntry } from "@/lib/portal/fees-page";
import type { ReFlag } from "@/lib/portal/re-flags-shared";
import { CONTRACT_STATUS_ICON } from "@/components/portal/contracts/contract-status-meta";
import { Section } from "@/components/portal/ui/Section";
import { InfoRow as Row } from "@/components/portal/ui/InfoRow";
import { BackLink } from "@/components/portal/ui/BackLink";
import { Chip } from "@/components/portal/ui/Chip";
import { BTN_PRIMARY, BTN_ROW, BTN_ICON } from "@/components/portal/ui/buttons";
import { reconcile, RECON_META, RE_CHECKIN_META } from "./real-estate-shared";
import { flagIconComp, flagTone } from "./re-flags-shared";
import {
  CATEGORY_HINT,
  CATEGORY_LABEL,
  CATEGORY_STYLE,
  CHIP_BASE,
  CLIENT_STATUS_LABEL,
  CONCEPT_LABEL,
  LANDLORD_LABEL,
  LEASE_STATUS_LABEL,
  LOCATION_STATUS_LABEL,
  LOCATION_STATUS_STYLE,
  MODE_LABEL,
  RE_AGENT_LABEL,
  TRANSITION_STATUS_LABEL,
  TRANSITION_STATUS_STYLE,
  formatBytes,
  formatDate,
  formatDateTime,
  formatMoney,
} from "./locations-shared";

// Lehký řádek smlouvy navázané na lokalitu (server v page.tsx mapuje plný
// Contract na tento tvar — plné objekty jsou těžké a přes RSC boundary jdou
// jen plain data).
export type LocationContractRow = {
  id: string;
  type: ContractType;
  status: ContractStatus;
  clientName: string;
  number: string | null;
  cancelled: boolean;
  createdAt: string;
  // Pro sekci Poplatky a fakturace (jen approval-gated podepsané smlouvy).
  variant: string | null;
  clientSignedAt: string | null;
  feeTerms: ContractFeeTerms | null;
  feeTermsError: string | null;
};

export function LocationDetail({
  location,
  contracts,
  flags,
  posPanel,
  isBos,
  bosReason,
  franchiseEndDate,
  feeHistory,
}: {
  location: LocationView;
  contracts: LocationContractRow[];
  // Konec franšízy lokality (ISO) - konec poplatků u spolupráce/provozování. "" = neznámý.
  franchiseEndDate: string;
  // Historie finálních poplatků za uzavřené měsíce (počítá server z plných Contract[]).
  feeHistory: FeeHistoryEntry[];
  // Flagy přiřazené této lokalitě (LocationLocal.flagIds přeložené přes katalog).
  flags: ReFlag[];
  // Panel Tržeb (server komponenta předaná z page.tsx). Vykreslí se hned pod
  // hlavičkou; je-li null (bez přístupu/bez napárované pokladny), nic se nepřidá.
  posPanel?: ReactNode;
  // „BOS prodejna" — sdílená odvozená proměnná (isBosStore). Počítá ji server
  // (page.tsx) ze stejných zdrojů jako jinde; tady jen zobrazujeme.
  isBos: boolean;
  bosReason: string;
}) {
  const l = location;
  const recon = RECON_META[reconcile(l.lease_current_status, l.lease_target_status)];
  const checkIn = l.local?.reCheckIn ?? null;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/portal/locations">Zpět na lokality</BackLink>

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {l.category && (
            <span className={`${CHIP_BASE} ${CATEGORY_STYLE[l.category]}`}>
              {CATEGORY_LABEL[l.category]}
            </span>
          )}
          <span className={`${CHIP_BASE} border-edge bg-paper text-ink-deep`}>
            {CONCEPT_LABEL[l.concept]}
          </span>
          {l.location_status && (
            <span className={`${CHIP_BASE} ${LOCATION_STATUS_STYLE[l.location_status]}`}>
              {LOCATION_STATUS_LABEL[l.location_status]}
            </span>
          )}
          {l.transition_status && (
            <span className={`${CHIP_BASE} ${TRANSITION_STATUS_STYLE[l.transition_status]}`}>
              {TRANSITION_STATUS_LABEL[l.transition_status]}
            </span>
          )}
          {/* „BOS prodejna" (odvozeno): pozitivní chip jen když JE BOS; stav Ano/Ne
              je vždy i v sekci „Provoz a stav" níže. */}
          {isBos && (
            <span
              className={`${CHIP_BASE} border-emerald-300 bg-emerald-50 text-emerald-700`}
              title="Patří do BOS sítě: podepsaná franšíza, nebo NewCo bez červené"
            >
              <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              BOS prodejna
            </span>
          )}
          {/* Flagy z RE tabulky (read-only). Editují se v Real Estate tabulce. */}
          {flags.map((f) => {
            const Ico = flagIconComp(f.icon);
            return (
              <span key={f.id} className={`${CHIP_BASE} ${flagTone(f.color).chip}`}>
                <Ico className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {f.label}
              </span>
            );
          })}
        </div>
        <div>
          <h1 className="font-extrabold text-[clamp(1.6rem,3vw,2.2rem)] tracking-[-0.02em] text-ink-base">
            {l.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-mid">
            {l.code && <span className="font-mono">{l.code}</span>}
            {l.category && <span>{CATEGORY_HINT[l.category]}</span>}
          </div>
        </div>
      </header>

      {posPanel}

      <div className="flex items-center gap-2 rounded-2xl border border-edge bg-paper-warm px-5 py-3 text-[12.5px] text-ink-mid">
        <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span>
          Data lokality jsou zrcadlo z Transition a needitují se zde. Upravit lze
          jen lokální poznámku a přílohy níže; flagy a Poznámku se stejně promítají
          do Real Estate tabulky.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="Nájem a přepis">
          <Row label="Aktuální stav nájmu" value={LEASE_STATUS_LABEL[l.lease_current_status]} />
          <Row label="Cílový stav nájmu" value={LEASE_STATUS_LABEL[l.lease_target_status]} />
          <Row
            label="Stav řešení"
            value={
              <Chip tone={recon.tone}>
                <recon.Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                {recon.label}
              </Chip>
            }
          />
          <Row label="Stav přechodu" value={TRANSITION_STATUS_LABEL[l.transition_status]} />
          <Row label="Zodpovědná osoba" value={l.responsible} />
          <Row label="Výjimku schválil" value={l.exception_approved_by} />
        </Section>

        <Section title="Realitní operativa">
          <Row label="RE agent" value={l.re_agent ? RE_AGENT_LABEL[l.re_agent] : null} />
          <Row
            label="Hlášení agenta"
            value={
              checkIn ? (
                <span className="inline-flex items-center gap-2">
                  <Chip tone={RE_CHECKIN_META[checkIn.status].tone}>
                    {RE_CHECKIN_META[checkIn.status].label}
                  </Chip>
                  <span className="text-[11.5px] text-ink-soft">
                    {RE_AGENT_LABEL[checkIn.by]} · {formatDate(checkIn.at)}
                  </span>
                </span>
              ) : null
            }
          />
          <Row
            label="Dohoda s pronajímatelem"
            value={l.landlord_agreement ? LANDLORD_LABEL[l.landlord_agreement] : l.landlord_agreement_raw}
          />
          <Row label="Příplatek" value={l.surcharge_amount ? formatMoney(l.surcharge_amount) : null} />
          <Row label="IČO klienta" value={l.client_ico} mono />
          <Row label="Hrozí výpověď" value={l.eviction_risk ? "Ano" : null} />
          <Row label="Aktivně řešeno" value={l.re_active ? "Ano" : null} />
          <Row label="Další krok" value={l.next_step} />
          <Row label="Poznámka k RE (Transition)" value={l.re_status_note} />
        </Section>

        <Section title="Provoz a stav">
          <Row
            label="BOS prodejna"
            value={
              <span
                className="inline-flex items-center gap-2"
                title={`Patří do BOS sítě: podepsaná franšíza (přebíjí vše), nebo je v NewCo a není označená červeně (kromě „řešit i přes červenou“). Jiný pojem než nájemní cíl „na BOS“.`}
              >
                <Chip
                  tone={
                    isBos
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-edge bg-edge-warm text-ink-mid"
                  }
                >
                  {isBos && (
                    <Building2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  {isBos ? "Ano" : "Ne"}
                </Chip>
                <span className="text-[11.5px] text-ink-soft">{bosReason}</span>
              </span>
            }
          />
          <Row
            label="Fyzický stav"
            value={l.location_status ? LOCATION_STATUS_LABEL[l.location_status] : null}
          />
          <Row
            label="Stav klienta"
            value={l.client_status ? CLIENT_STATUS_LABEL[l.client_status] : null}
          />
          <Row label="Důvod stavu" value={l.client_status_reason} />
          <Row label="Datum otevření" value={formatDate(l.opening_date)} />
          <Row label="Datum zavření" value={formatDate(l.closing_date)} />
          <Row label="Aktuální režim" value={l.current_mode ? MODE_LABEL[l.current_mode] : null} />
          <Row
            label="Nový režim"
            value={
              l.new_mode
                ? `${MODE_LABEL[l.new_mode]}${l.new_mode_start_date ? ` (od ${formatDate(l.new_mode_start_date)})` : ""}`
                : null
            }
          />
          <Row label="OP 2026" value={l.op_2026 ? formatMoney(l.op_2026) : null} />
        </Section>

        <Section title="Klient a obsazení">
          <Row label="Aktuální klient" value={l.current_client_name} />
          <Row label="Nový klient" value={l.new_client_name} />
          <Row label="Cílový franšízant" value={l.target_franchisee} />
          <Row
            label="Zájemců ve frontě"
            value={l.overcrowded_client_count ? String(l.overcrowded_client_count) : null}
          />
          <Row label="V novém TWIST" value={l.in_new_twist ? "Ano" : "Ne"} />
        </Section>

        {l.local?.newco && (
          <Section title="NewCo">
            <Row label="Entita CEIP #1" value={l.local.newco.entitaCeip1} />
            <Row label="Entita CEIP #2" value={l.local.newco.entitaCeip2} />
            <Row label="103" value={l.local.newco.field103} />
            <Row label="V business plánu (Y/N)" value={l.local.newco.includeInBusinessPlan} />
            <Row label="Operational type" value={l.local.newco.operationalType} />
            <Row label="Category" value={l.local.newco.category} />
            <div className="flex items-baseline justify-between gap-4 border-b border-edge/60 py-2 last:border-0">
              <span className="shrink-0 text-[12.5px] text-ink-mid">Označeno červeně</span>
              <Chip
                tone={
                  l.local.newco.flaggedRed || l.local.manualRed
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-edge bg-edge-warm text-ink-mid"
                }
              >
                {l.local.newco.flaggedRed
                  ? "Ano"
                  : l.local.manualRed
                    ? "Ano (ručně)"
                    : "Ne"}
              </Chip>
            </div>
            {l.local.manualRed && !l.local.newco.flaggedRed && (
              <p className="text-[11.5px] text-ink-soft">
                Ručně označeno {formatDate(l.local.manualRed.at)} · {l.local.manualRed.by}
              </p>
            )}
            {(l.local.newco.flaggedRed || l.local.manualRed) && (
              <Row
                label="Řešit i přes červenou"
                value={l.local.solveDespiteRed ? "Ano" : "Ne"}
              />
            )}
            <p className="mt-3 text-[11.5px] text-ink-soft">
              Importováno {formatDate(l.local.newco.importedAt)} · {l.local.newco.importedBy}
            </p>
          </Section>
        )}
      </div>

      <LocationContracts contracts={contracts} />

      <LocationFeeTermsSection contracts={contracts} franchiseEndDate={franchiseEndDate} />
      <FeeHistorySection entries={feeHistory} />

      {l.note && (
        <Section title="Poznámka z Transition">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-deep">
            {l.note}
          </p>
        </Section>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px] text-ink-soft">
        <span>Vytvořeno {formatDate(l.created_at)} · {l.created_by || "—"}</span>
        <span>Aktualizováno {formatDate(l.updated_at)} · {l.updated_by || "—"}</span>
      </div>

      <LocalNote location={l} />
      <Attachments location={l} />
    </div>
  );
}

// ── Smlouvy k lokalitě ──────────────────────────────────────────────────────

function LocationContracts({ contracts }: { contracts: LocationContractRow[] }) {
  return (
    <Section
      title="Smlouvy k lokalitě"
      hint="Franšízingové, o spolupráci a o provozování navázané na tuto lokalitu."
    >
      {contracts.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-edge px-4 py-5 text-[13px] text-ink-mid">
          <FileText className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          K této lokalitě zatím není navázaná žádná smlouva.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {contracts.map((c) => {
            const StatusIcon = CONTRACT_STATUS_ICON[c.status];
            return (
              <li key={c.id}>
                <Link
                  href={`/portal/contracts/${c.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-edge bg-paper px-4 py-3 transition-colors hover:border-ink-base"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-edge-warm text-ink-deep">
                    <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink-base">
                      <span className="truncate">{CONTRACT_TYPE_META[c.type].shortName}</span>
                      <ArrowUpRight
                        className="h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-ink-soft">
                      <span className="truncate">{c.clientName}</span>
                      {c.number && <span className="font-mono">{c.number}</span>}
                    </div>
                  </div>
                  <Chip tone={CONTRACT_STATUS_STYLE[c.status]}>
                    <StatusIcon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                    {CONTRACT_STATUS_LABEL[c.status]}
                  </Chip>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ── Lokální poznámka ──────────────────────────────────────────────────────────

function LocalNote({ location }: { location: LocationView }) {
  const [note, setNote] = useState(location.local?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const original = location.local?.note ?? "";
  const dirty = note !== original;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/portal/locations/${location.id}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Uložení selhalo.");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Poznámka"
      hint="Jen v BOServices — stejné pole jako sloupec Poznámka v Real Estate tabulce. Synchronizace z Transition se jí nedotkne."
    >
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        rows={5}
        placeholder="Poznámky oblastního manažera, kontext k nájemní smlouvě, úkoly…"
        className="w-full resize-y rounded-xl border border-edge bg-paper px-4 py-3 text-[13.5px] leading-relaxed text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className={BTN_PRIMARY}
        >
          {saving ? "Ukládám…" : "Uložit poznámku"}
        </button>
        {saved && <span className="text-[12.5px] text-emerald-600">Uloženo.</span>}
        {error && <span className="text-[12.5px] text-red-600">{error}</span>}
        {location.local?.updatedAt && !dirty && !saved && (
          <span className="text-[11.5px] text-ink-soft">
            Naposledy {formatDateTime(location.local.updatedAt)}
          </span>
        )}
      </div>
    </Section>
  );
}

// ── Přílohy ───────────────────────────────────────────────────────────────────

function Attachments({ location }: { location: LocationView }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attachments = location.local?.attachments ?? [];

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const blob = await upload(
          `portal/locations/${location.id}/files/${file.name}`,
          file,
          {
            access: "public",
            handleUploadUrl: `/api/portal/locations/${location.id}/attachments/upload`,
            contentType: file.type || undefined,
          },
        );
        const res = await fetch(`/api/portal/locations/${location.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            url: blob.url,
            pathname: blob.pathname,
            size: file.size,
            contentType: file.type || "application/octet-stream",
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Evidence přílohy selhala.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nahrání selhalo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(attachmentId: string, name: string) {
    if (!window.confirm(`Smazat přílohu ${name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/locations/${location.id}/attachments?attachmentId=${attachmentId}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Smazání selhalo.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Smazání selhalo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Přílohy"
      hint="Nájemní smlouvy, dodatky, předávací protokoly — uložené v BOServices."
      action={
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={BTN_ROW}
        >
          <Upload className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          {busy ? "Nahrávám…" : "Nahrát"}
        </button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
      />

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          {error}
        </div>
      )}

      {attachments.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-edge px-4 py-5 text-[13px] text-ink-mid">
          <Paperclip className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          Zatím žádné přílohy.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-xl border border-edge bg-paper px-4 py-3"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-edge-warm text-ink-deep">
                <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 truncate text-[13.5px] font-medium text-ink-base hover:underline"
                >
                  <span className="truncate">{a.name}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-ink-soft" strokeWidth={1.5} />
                </a>
                <div className="mt-0.5 text-[11.5px] text-ink-soft">
                  {formatBytes(a.size)} · {formatDateTime(a.uploadedAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(a.id, a.name)}
                disabled={busy}
                aria-label={`Smazat ${a.name}`}
                className={`${BTN_ICON} shrink-0`}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
