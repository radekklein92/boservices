"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  MapPin,
  Mail,
  ShieldCheck,
  Pencil,
} from "lucide-react";
import type { Contract } from "@/lib/portal/contracts-db";
import {
  APPROVAL_KEY,
  getApprovalView,
  LEASE_HOLDER_LABEL,
  MANUAL_APPROVAL_RULE,
  NEW_MODE_LABEL,
} from "@/lib/portal/contract-approval";
import { computeContractFee, type ContractFee } from "@/lib/portal/contract-fees";
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
  locationNewco?: { entitaCeip1: string; operationalType: string } | null;
  standardOperatingFee?: string | null;
  onChanged: (next: Contract) => void;
  notify: Notify;
}) {
  const [editingLocation, setEditingLocation] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const view = getApprovalView(contract);
  const snap = contract.locationSnapshot ?? null;
  const hasApprover = approverEmails.length > 0;
  // Poplatek/odměna z textu smlouvy (živě z aktuálního stavu, reflektuje editace).
  const fee = computeContractFee(contract, standardOperatingFee);

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

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-edge bg-paper px-6 py-6 md:px-8 md:py-7">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          Lokalita a schválení
        </div>
      </div>

      {/* Lokalita */}
      {snap ? (
        <div className="flex flex-col gap-3">
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
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[12.5px] text-ink-mid">
            <span>
              Nájemní smlouva{" "}
              <span className="font-medium text-ink-base">
                {LEASE_HOLDER_LABEL[snap.leaseStatus]}
              </span>
            </span>
            <span>
              Nový režim{" "}
              <span className="font-medium text-ink-base">
                {snap.newMode ? NEW_MODE_LABEL[snap.newMode] : "neuvedeno"}
              </span>
            </span>
            {locationNewco?.entitaCeip1 && (
              <span>
                Entita CEIP #1{" "}
                <span className="font-medium text-ink-base">
                  {locationNewco.entitaCeip1}
                </span>
              </span>
            )}
            {locationNewco?.operationalType && (
              <span>
                Operational type{" "}
                <span className="font-medium text-ink-base">
                  {locationNewco.operationalType}
                </span>
              </span>
            )}
          </div>
        </div>
      ) : view.kind === "grandfathered" ? null : (
        <p className="text-[13px] text-ink-mid">
          Smlouva zatím nemá vybranou lokalitu.
        </p>
      )}

      {/* Poplatek / odměna z textu smlouvy (s detekcí ruční úpravy) */}
      {fee && <FeeRow fee={fee} />}

      {/* Rozhodnutí */}
      <div className="flex flex-col gap-2">
        <ApprovalBadge contract={contract} />
        {contract.approvalNote && (
          <p className="text-[12.5px] italic leading-snug text-ink-mid">
            „{contract.approvalNote}"
          </p>
        )}
      </div>

      {/* Akce: změna lokality (koncept) / připomenutí (ke-schvaleni, non-approver) */}
      <div className="flex flex-col gap-3">
        {canEditLocation &&
          (editingLocation ? (
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
          ) : (
            <button
              type="button"
              onClick={() => setEditingLocation(true)}
              disabled={pending === "location"}
              className={`${BTN_ROW} w-fit`}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              {contract.locationId ? "Změnit lokalitu" : "Vybrat lokalitu"}
            </button>
          ))}

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
          <ol className="mt-2.5 flex flex-col gap-1.5">
            {APPROVAL_KEY.map((k) => (
              <li key={k.rule} className="flex gap-2 text-[12px] leading-snug text-ink-deep">
                <span className="font-semibold text-ink-base">{k.rule})</span>
                <span>{k.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function FeeRow({ fee }: { fee: ContractFee }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-ink-mid">
      <span>
        {fee.label}{" "}
        <span className="font-semibold text-ink-base">{fee.value}</span>
      </span>
      {fee.changed && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          <AlertTriangle className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          Liší se od standardu
          {fee.standard ? ` · standardně ${fee.standard}` : ""}
        </span>
      )}
    </div>
  );
}

function ApprovalBadge({ contract }: { contract: Contract }) {
  const view = getApprovalView(contract);

  switch (view.kind) {
    case "auto-approved":
      return (
        <Badge tone="ok" Icon={CheckCircle2}>
          Automaticky schváleno (pravidlo {view.rule})
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
        <Badge tone="wait" Icon={Clock}>
          Čeká na schválení schvalovatelů (pravidlo {MANUAL_APPROVAL_RULE})
        </Badge>
      );
    case "grandfathered":
      return (
        <Badge tone="ok" Icon={CheckCircle2}>
          Schváleno (historicky)
        </Badge>
      );
    case "draft":
      return view.autoRule ? (
        <Badge tone="ok" Icon={CheckCircle2}>
          Po odeslání: automaticky schváleno (pravidlo {view.autoRule})
        </Badge>
      ) : (
        <Badge tone="wait" Icon={Clock}>
          Po odeslání: bude vyžadovat schválení schvalovatelů (pravidlo {MANUAL_APPROVAL_RULE})
        </Badge>
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
