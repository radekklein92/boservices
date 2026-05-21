"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  PenLine,
  Undo2,
  Upload,
  Download,
  Trash2,
  Gavel,
  Stamp,
} from "lucide-react";
import type { Contract } from "@/lib/portal/contracts-db";
import { SignerPickerModal } from "./SignerPickerModal";

type Notify = (kind: "ok" | "error", msg: string) => void;

export function ContractCurrentActionPanel({
  contract,
  onChanged,
  notify,
}: {
  contract: Contract;
  onChanged: (next: Contract) => void;
  notify: Notify;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload(): Promise<Contract | null> {
    try {
      const res = await fetch(`/api/portal/contracts/${contract.id}`);
      const j = await res.json();
      return j.ok ? j.contract : null;
    } catch {
      return null;
    }
  }

  async function callMilestone(
    method: "POST" | "DELETE",
    endpoint: string,
    okMsg: string,
    body?: unknown,
  ) {
    setPending(`${method}:${endpoint}`);
    try {
      const res = await fetch(`/api/portal/contracts/${contract.id}/${endpoint}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      const next = await reload();
      if (next) onChanged(next);
      notify("ok", okMsg);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setPending(null);
    }
  }

  async function approve() {
    await callMilestone("POST", "approve", "Smlouva schválena.");
  }

  async function unapprove() {
    if (!window.confirm("Zrušit schválení? Tím se zruší i případné navazující kroky."))
      return;
    await callMilestone("DELETE", "approve", "Schválení zrušeno.");
  }

  async function pickSigner(email: string) {
    await callMilestone("POST", "pick-signer", "Podepisující přiřazen.", { email });
    setPickerOpen(false);
  }

  async function unpickSigner() {
    if (!window.confirm("Zrušit výběr podepisujícího? Smlouva spadne zpět na Schváleno."))
      return;
    await callMilestone("DELETE", "pick-signer", "Výběr zrušen.");
  }

  async function markSignedBos() {
    await callMilestone("POST", "signed", "Označeno jako Podepsáno BOS.");
  }

  async function unmarkSignedBos() {
    if (!window.confirm("Zrušit Podepsáno BOS?")) return;
    await callMilestone("DELETE", "signed", "Označení zrušeno.");
  }

  async function markClientSigned() {
    await callMilestone("POST", "client-signed", "Označeno jako Podepsáno klientem.");
  }

  async function unmarkClientSigned() {
    if (!window.confirm("Zrušit Podepsáno klientem?")) return;
    await callMilestone("DELETE", "client-signed", "Označení zrušeno.");
  }

  async function uploadScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending("scan:upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/portal/contracts/${contract.id}/scan`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      const next = await reload();
      if (next) onChanged(next);
      notify("ok", "Sken nahrán, smlouva archivována.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setPending(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeScan() {
    if (!window.confirm("Odebrat nahraný sken? Smlouva spadne zpět na Podepsáno klientem."))
      return;
    await callMilestone("DELETE", "scan", "Sken odebrán.");
  }

  const status = contract.status;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-edge bg-paper px-6 py-6 md:px-8 md:py-7">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          Co teď
        </div>
      </div>

      {status === "koncept" && (
        <ActionRow
          headline="Smlouva je v konceptu"
          description={`Dokud nezkontroluješ obsah a neschválíš ji, generuje se PDF s vodoznakem „NÁVRH".`}
          primary={
            <PrimaryButton onClick={approve} pending={pending === "POST:approve"} Icon={CheckCircle2}>
              Schválit smlouvu
            </PrimaryButton>
          }
        />
      )}

      {status === "schvaleno" && (
        <ActionRow
          headline="Schváleno - vyber podepisujícího"
          description="Vyber konkrétního podepisujícího. Po výběru se vygeneruje finální PDF bez vodoznaku."
          primary={
            <PrimaryButton onClick={() => setPickerOpen(true)} Icon={Gavel}>
              Vybrat podepisujícího
            </PrimaryButton>
          }
          rollback={
            <SubtleButton onClick={unapprove} pending={pending === "DELETE:approve"} Icon={Undo2}>
              Zrušit schválení
            </SubtleButton>
          }
        />
      )}

      {status === "k-podpisu" && (
        <ActionRow
          headline="Čeká na podpis BOS"
          description="Stáhni finální PDF, vytiskni, podepiš a označ jako Podepsáno BOS."
          primary={
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={markSignedBos} pending={pending === "POST:signed"} Icon={Stamp}>
                Označit Podepsáno BOS
              </PrimaryButton>
              {contract.generatedPdfUrl && (
                <a
                  href={`/api/portal/contracts/${contract.id}/download/generated`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-edge bg-paper px-5 text-[13px] font-semibold text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  Finální PDF
                </a>
              )}
            </div>
          }
          rollback={
            <SubtleButton onClick={unpickSigner} pending={pending === "DELETE:pick-signer"} Icon={Undo2}>
              Změnit podepisujícího
            </SubtleButton>
          }
        />
      )}

      {status === "podepsano-bos" && (
        <ActionRow
          headline="Podepsáno BOS"
          description="Předej smlouvu klientovi a po jeho podpisu označ jako Podepsáno klientem."
          primary={
            <PrimaryButton onClick={markClientSigned} pending={pending === "POST:client-signed"} Icon={PenLine}>
              Označit Podepsáno klientem
            </PrimaryButton>
          }
          rollback={
            <SubtleButton onClick={unmarkSignedBos} pending={pending === "DELETE:signed"} Icon={Undo2}>
              Zrušit Podepsáno BOS
            </SubtleButton>
          }
        />
      )}

      {status === "podepsano-klientem" && (
        <ActionRow
          headline="Podepsáno klientem"
          description="Naskenuj podepsanou smlouvu a nahraj sken. Smlouva se tím archivuje."
          primary={
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={uploadScan}
                className="hidden"
              />
              <PrimaryButton
                onClick={() => fileRef.current?.click()}
                pending={pending === "scan:upload"}
                Icon={Upload}
              >
                Nahrát sken
              </PrimaryButton>
            </div>
          }
          rollback={
            <SubtleButton
              onClick={unmarkClientSigned}
              pending={pending === "DELETE:client-signed"}
              Icon={Undo2}
            >
              Zrušit Podepsáno klientem
            </SubtleButton>
          }
        />
      )}

      {status === "archivovano" && (
        <ActionRow
          headline="Archivováno"
          description="Smlouva je uzavřena a archivována. Naskenovaná kopie je v archivu."
          primary={
            contract.scanPdfUrl ? (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/api/portal/contracts/${contract.id}/download/scan`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  Stáhnout sken
                </a>
                <button
                  type="button"
                  onClick={removeScan}
                  disabled={pending === "DELETE:scan"}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-edge bg-paper px-5 text-[13px] font-medium text-ink-mid transition-colors hover:border-ink-base hover:text-ink-base"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  Odebrat sken
                </button>
              </div>
            ) : null
          }
        />
      )}

      {pickerOpen && (
        <SignerPickerModal
          currentSignerEmail={contract.signerEmail}
          onClose={() => setPickerOpen(false)}
          onPicked={pickSigner}
        />
      )}
    </div>
  );
}

function ActionRow({
  headline,
  description,
  primary,
  rollback,
}: {
  headline: string;
  description: string;
  primary: React.ReactNode;
  rollback?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-[480px]">
        <div className="text-[15px] font-bold tracking-[-0.01em] text-ink-base">
          {headline}
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mid">
          {description}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {primary}
        {rollback}
      </div>
    </div>
  );
}

function PrimaryButton({
  onClick,
  pending,
  Icon,
  children,
}: {
  onClick: () => void;
  pending?: boolean;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden={true} />
      {pending ? "Pracuji…" : children}
    </button>
  );
}

function SubtleButton({
  onClick,
  pending,
  Icon,
  children,
}: {
  onClick: () => void;
  pending?: boolean;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base disabled:opacity-50"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden={true} />
      {pending ? "…" : children}
    </button>
  );
}
