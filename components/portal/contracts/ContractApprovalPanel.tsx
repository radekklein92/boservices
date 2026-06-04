"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  MapPin,
  Mail,
  ShieldCheck,
  Pencil,
  X,
} from "lucide-react";
import type { Contract } from "@/lib/portal/contracts-db";
import {
  APPROVAL_KEY,
  APPROVAL_KEY_INTRO,
  getApprovalView,
  LEASE_HOLDER_LABEL,
  NEW_MODE_LABEL,
  type ApprovalReason,
  type ApprovalView,
  type NewcoSummary,
} from "@/lib/portal/contract-approval";
import { computeContractFee } from "@/lib/portal/contract-fees";
import {
  CATEGORY_LABEL,
  CATEGORY_STYLE,
  CHIP_BASE,
  formatDate,
} from "@/components/portal/locations/locations-shared";
import { LocationCombobox } from "@/components/portal/ui/LocationCombobox";
import { BTN_ROW } from "@/components/portal/ui/buttons";

type Notify = (kind: "ok" | "error", msg: string) => void;

export function ContractApprovalPanel({
  contract,
  isApprover,
  isSuperadmin = false,
  approverEmails,
  locationNewco = null,
  standardOperatingFee = null,
  onChanged,
  notify,
}: {
  contract: Contract;
  isApprover: boolean;
  isSuperadmin?: boolean;
  approverEmails: string[];
  locationNewco?: NewcoSummary | null;
  standardOperatingFee?: string | null;
  onChanged: (next: Contract) => void;
  notify: Notify;
}) {
  const [editingLocation, setEditingLocation] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const view = getApprovalView(contract, locationNewco);
  const snap = contract.locationSnapshot ?? null;
  const hasApprover = approverEmails.length > 0;
  // Poplatek/odměna z textu smlouvy (živě z aktuálního stavu, reflektuje editace).
  const fee = computeContractFee(contract, standardOperatingFee);

  // Kódy důvodů, které brání automatickému schválení - u dotčené hodnoty
  // vykreslíme křížek. Důvody nese view jen u draft/pending.
  const blockingCodes = new Set<string>(
    view.kind === "draft" || view.kind === "pending"
      ? view.reasons.map((r) => r.code)
      : [],
  );
  const blocks = (...codes: string[]) => codes.some((c) => blockingCodes.has(c));

  async function reload(): Promise<Contract | null> {
    try {
      const res = await fetch(`/api/portal/contracts/${contract.id}`);
      const j = await res.json();
      return j.ok ? j.contract : null;
    } catch {
      return null;
    }
  }

  async function pickLocation(locationId: string) {
    if (!locationId) return;
    setPending("location");
    try {
      const res = await fetch(`/api/portal/contracts/${contract.id}/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      const next = await reload();
      if (next) onChanged(next);
      setEditingLocation(false);
      notify("ok", "Lokalita uložena.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setPending(null);
    }
  }

  async function remind() {
    setPending("remind");
    try {
      const res = await fetch(`/api/portal/contracts/${contract.id}/remind`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      const count = data.recipients?.length ?? 0;
      notify(
        "ok",
        `Upozornění odesláno ${count === 1 ? "schvalovateli" : `${count} schvalovatelům`}.`,
      );
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setPending(null);
    }
  }

  const canEditLocation = contract.status === "koncept";

  // Fakta lokality + poplatek do jedné přehledné mřížky (štítek/hodnota).
  // Blokující hodnoty (důvod ručního schválení) se vyznačí červeně s křížkem.
  type Fact = {
    label: string;
    value: string;
    blocked?: boolean;
    tone?: "default" | "warn";
    note?: string;
  };
  const facts: Fact[] = [];
  if (snap) {
    facts.push({
      label: "Nájemní smlouva",
      value: LEASE_HOLDER_LABEL[snap.leaseStatus],
      blocked: blocks("lease-not-fr-bos", "lease-not-bos"),
    });
    facts.push({
      label: "Nový režim",
      value: snap.newMode ? NEW_MODE_LABEL[snap.newMode] : "neuvedeno",
      blocked: blocks("unknown-mode"),
    });
    if (locationNewco) {
      facts.push({
        label: "V souboru NEWCO",
        value: locationNewco.inFile ? "Ano" : "Ne",
        tone: locationNewco.inFile ? "default" : "warn",
        blocked: blocks("not-in-newco"),
      });
    }
    if (locationNewco?.entitaCeip1) {
      facts.push({
        label: "Entita CEIP #1",
        value: locationNewco.entitaCeip1,
        blocked: blocks("entita-tbe"),
      });
    }
    if (locationNewco?.operationalType) {
      facts.push({
        label: "Operational type",
        value: locationNewco.operationalType,
        blocked: blocks("optype-own"),
      });
    }
  }
  if (fee) {
    facts.push({
      label: fee.label,
      value: fee.value,
      blocked: blocks(
        "franchise-fee-low",
        "support-fee-low",
        "operating-fee-low",
        "fee-unknown",
      ),
      note: fee.changed
        ? `Liší se od standardu${fee.standard ? ` (standardně ${fee.standard})` : ""}`
        : undefined,
    });
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-edge bg-paper px-6 py-6 md:px-8 md:py-7">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          Lokalita a schválení
        </div>
        {canEditLocation && !editingLocation && (
          <button
            type="button"
            onClick={() => setEditingLocation(true)}
            disabled={pending === "location"}
            className={`${BTN_ROW} shrink-0 whitespace-nowrap`}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            {contract.locationId ? "Změnit lokalitu" : "Vybrat lokalitu"}
          </button>
        )}
      </div>

      {/* Název lokality */}
      {snap ? (
        <div className="flex flex-wrap items-center gap-2.5">
          {contract.locationId ? (
            <Link
              href={`/portal/locations/${contract.locationId}`}
              className="group inline-flex items-center gap-1.5 text-[15px] font-bold tracking-[-0.01em] text-ink-base"
            >
              <MapPin className="h-4 w-4 text-ink-mid" strokeWidth={1.5} aria-hidden="true" />
              {snap.name}
              <ArrowUpRight
                className="h-3.5 w-3.5 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[15px] font-bold text-ink-base">
              <MapPin className="h-4 w-4 text-ink-mid" strokeWidth={1.5} aria-hidden="true" />
              {snap.name}
            </span>
          )}
          {snap.category && (
            <span className={`${CHIP_BASE} ${CATEGORY_STYLE[snap.category]}`}>
              {CATEGORY_LABEL[snap.category]}
            </span>
          )}
        </div>
      ) : view.kind === "grandfathered" ? null : (
        <p className="text-[13px] text-ink-mid">
          Smlouva zatím nemá vybranou lokalitu.
        </p>
      )}

      {/* Fakta lokality + poplatek - přehledná mřížka štítek/hodnota */}
      {facts.length > 0 && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border border-edge bg-paper-warm px-4 py-4 sm:grid-cols-3">
          {facts.map((f) => (
            <FactCell key={f.label} {...f} />
          ))}
        </div>
      )}

      {/* Stav schválení */}
      <div className="flex flex-col gap-2">
        <ApprovalBadge view={view} />
        {contract.approvalNote && (
          <p className="text-[12.5px] italic leading-snug text-ink-mid">
            „{contract.approvalNote}"
          </p>
        )}
      </div>

      {/* Akce: výběr lokality (editace) / připomenutí (ke-schvaleni, non-approver) */}
      {((canEditLocation && editingLocation) ||
        (contract.status === "ke-schvaleni" && !isApprover && !isSuperadmin)) && (
        <div className="flex flex-col gap-3">
          {canEditLocation && editingLocation && (
            <div className="flex flex-col gap-2">
              <LocationCombobox
                value={contract.locationId ?? ""}
                selectedName={snap?.name}
                onChange={(id) => {
                  if (id) pickLocation(id);
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setEditingLocation(false)}
                className="w-fit text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base"
              >
                Zrušit
              </button>
            </div>
          )}

          {contract.status === "ke-schvaleni" && !isApprover && !isSuperadmin && (
            <button
              type="button"
              onClick={remind}
              disabled={!hasApprover || pending === "remind"}
              title={
                hasApprover
                  ? `Pošle e-mail schvalovatelům (${approverEmails.join(", ")})`
                  : "Schvalovatel není nastaven"
              }
              className={`${BTN_ROW} w-fit`}
            >
              <Mail className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              {pending === "remind" ? "Odesílám…" : "Připomenout e-mailem"}
            </button>
          )}
        </div>
      )}

      {/* Klíč k automatickému schválení - sbalený, na rozkliknutí. */}
      <div className="rounded-xl border border-edge bg-paper-warm px-4 py-3">
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          aria-expanded={showKey}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-mid">
            Klíč k automatickému schválení
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-ink-mid transition-transform ${showKey ? "rotate-180" : ""}`}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
        {showKey && (
          <div className="mt-2.5 flex flex-col gap-2">
            <p className="text-[12px] leading-snug text-ink-mid">{APPROVAL_KEY_INTRO}</p>
            <ul className="flex flex-col gap-1.5">
              {APPROVAL_KEY.map((text) => (
                <li key={text} className="flex gap-2 text-[12px] leading-snug text-ink-deep">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-soft" aria-hidden="true" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Buňka mřížky faktů: štítek nad hodnotou. Blokující (důvod ručního schválení)
// = červeně s křížkem; tone „warn" = jantarová; volitelná poznámka pod hodnotou.
function FactCell({
  label,
  value,
  blocked = false,
  tone = "default",
  note,
}: {
  label: string;
  value: React.ReactNode;
  blocked?: boolean;
  tone?: "default" | "warn";
  note?: string;
}) {
  const valueClass = blocked
    ? "text-rose-600"
    : tone === "warn"
      ? "text-amber-700"
      : "text-ink-base";
  return (
    <div className="min-w-0">
      <div
        className={`flex items-start gap-1 text-[10px] font-medium uppercase leading-tight tracking-[0.13em] ${
          blocked ? "text-rose-500" : "text-ink-soft"
        }`}
      >
        {blocked && (
          <X
            className="mt-[1px] h-3 w-3 shrink-0"
            strokeWidth={3}
            aria-label="Blokuje automatické schválení"
          />
        )}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-[13.5px] font-semibold leading-snug ${valueClass}`}>
        {value}
      </div>
      {note && (
        <div className="mt-1 text-[11px] leading-snug text-amber-700">{note}</div>
      )}
    </div>
  );
}

// Výpis důvodů, proč smlouva míří ke schvalovatelům.
function ReasonsList({ reasons }: { reasons: ApprovalReason[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {reasons.map((r, i) => (
        <li
          key={`${r.code}-${i}`}
          className="flex gap-2 text-[12px] leading-snug text-amber-700"
        >
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

function ApprovalBadge({ view }: { view: ApprovalView }) {
  switch (view.kind) {
    case "auto-approved":
      return (
        <Badge tone="ok" Icon={CheckCircle2}>
          Automaticky schváleno
        </Badge>
      );
    case "approved-by-approver":
      return (
        <Badge tone="ok" Icon={ShieldCheck}>
          Schváleno schvalovatelem
          {view.by ? ` · ${view.by}` : ""}
          {view.at ? ` · ${formatDate(view.at)}` : ""}
        </Badge>
      );
    case "pending":
      return (
        <div className="flex flex-col gap-2">
          <Badge tone="wait" Icon={Clock}>
            Čeká na schválení schvalovatelů
          </Badge>
          {view.auto ? (
            <p className="text-[12px] leading-snug text-emerald-700">
              Podle aktuálních dat už smlouva splňuje podmínky automatického
              schválení. Pro automatické schválení ji vrať do konceptu a odešli
              znovu - nebo ji schvalovatel rovnou schválí.
            </p>
          ) : (
            <ReasonsList reasons={view.reasons} />
          )}
        </div>
      );
    case "grandfathered":
      return (
        <Badge tone="ok" Icon={CheckCircle2}>
          Schváleno (historicky)
        </Badge>
      );
    case "draft":
      return view.auto ? (
        <Badge tone="ok" Icon={CheckCircle2}>
          Po odeslání: automaticky schváleno
        </Badge>
      ) : (
        <div className="flex flex-col gap-2">
          <Badge tone="wait" Icon={Clock}>
            Po odeslání: půjde ke schvalovatelům
          </Badge>
          <ReasonsList reasons={view.reasons} />
        </div>
      );
    case "needs-location":
      return (
        <Badge tone="muted" Icon={MapPin}>
          Vyberte lokalitu pro vyhodnocení schválení
        </Badge>
      );
    default:
      return null;
  }
}

function Badge({
  tone,
  Icon,
  children,
}: {
  tone: "ok" | "wait" | "muted";
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-600 text-paper"
      : tone === "wait"
        ? "border border-amber-300 bg-amber-50 text-amber-700"
        : "border border-edge bg-paper-warm text-ink-deep";
  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${toneClass}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden={true} />
      {children}
    </span>
  );
}
