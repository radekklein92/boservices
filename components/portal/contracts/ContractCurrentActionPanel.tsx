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
  Send,
  ShieldCheck,
} from "lucide-react";
import dynamicImport from "next/dynamic";
import { upload } from "@vercel/blob/client";
import {
  getStatusFlowForType,
  type Contract,
  type ContractStatus,
} from "@/lib/portal/contracts-db";
import {
  isApprovalGated,
  requiresAdminToApproveDraft,
} from "@/lib/portal/contract-types";
import { getApprovalView, type NewcoSummary } from "@/lib/portal/contract-approval";
import { BTN_PRIMARY, BTN_SUBTLE } from "@/components/portal/ui/buttons";
import { KEEP_ORIGINAL_SIGNER } from "./signer-keep-original";

const SignerPickerModal = dynamicImport(
  () => import("./SignerPickerModal").then((m) => m.SignerPickerModal),
  { ssr: false },
);
const ApprovalNoteModal = dynamicImport(
  () => import("./ApprovalNoteModal").then((m) => m.ApprovalNoteModal),
  { ssr: false },
);

type Notify = (kind: "ok" | "error", msg: string) => void;

// Bezpečný název souboru pro cestu v Blob storu (bez diakritiky a speciálních znaků).
function scanSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9.\-_\s]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 100) || "scan.pdf"
  );
}

export function ContractCurrentActionPanel({
  contract,
  onChanged,
  notify,
  isApprover = false,
  isSuperadmin = false,
  isAdmin = false,
  locationNewco = null,
}: {
  contract: Contract;
  onChanged: (next: Contract) => void;
  notify: Notify;
  // Aktuální uživatel je schvalovatel šablon - vidí „Schválit" bez poznámky.
  isApprover?: boolean;
  // Superadmin smí schválit i bez role schvalovatele, ale musí uvést poznámku.
  isSuperadmin?: boolean;
  // Admin (admin/superadmin) - smí z konceptu schválit Odstoupení a Postoupení.
  isAdmin?: boolean;
  // NewCo souhrn lokality - pro přesnou predikci klíče v Konceptu.
  locationNewco?: NewcoSummary | null;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
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

  async function approve(note?: string) {
    await callMilestone(
      "POST",
      "approve",
      "Smlouva schválena.",
      note ? { note } : undefined,
    );
  }

  async function unapprove() {
    if (!window.confirm("Zrušit schválení? Tím se zruší i případné navazující kroky."))
      return;
    await callMilestone("DELETE", "approve", "Schválení zrušeno.");
  }

  // Typy posuzované podle lokality: odeslání z Konceptu vyhodnotí klíč
  // (auto → rovnou Schváleno, jinak → Ke schválení).
  async function submitForApproval() {
    setPending("POST:submit");
    try {
      const res = await fetch(`/api/portal/contracts/${contract.id}/submit`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      const next = await reload();
      if (next) onChanged(next);
      notify(
        "ok",
        data.auto
          ? "Automaticky schváleno."
          : "Odesláno ke schválení schvalovatelům.",
      );
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setPending(null);
    }
  }

  async function returnToDraft() {
    if (!window.confirm("Vrátit smlouvu do konceptu? Zruší se odeslání i případné schválení."))
      return;
    await callMilestone("DELETE", "submit", "Vráceno do konceptu.");
  }

  async function pickSigner(email: string) {
    const keep = email === KEEP_ORIGINAL_SIGNER;
    await callMilestone(
      "POST",
      "pick-signer",
      keep ? "Zachován původní zástupce ze smlouvy." : "Podepisující přiřazen.",
      keep ? { keepOriginal: true } : { email },
    );
    setPickerOpen(false);
  }

  // Odstoupení: BOS nepodepisuje. „Připravit k podpisu" jen vygeneruje finální
  // PDF (keepOriginal = bez výběru podepisujícího) a posune do stavu K podpisu.
  async function prepareForSigning() {
    await callMilestone("POST", "pick-signer", "Připraveno k podpisu.", {
      keepOriginal: true,
    });
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

  // NDA: odeslání k elektronickému podpisu přes DigiSign (oběma stranám).
  async function sendDigisign() {
    if (
      !window.confirm(
        "Odeslat NDA k elektronickému podpisu přes DigiSign? Obě strany dostanou e-mail s odkazem k podpisu.",
      )
    ) {
      return;
    }
    await callMilestone(
      "POST",
      "digisign-send",
      "NDA odeslána k podpisu přes DigiSign.",
    );
  }

  async function uploadScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      notify("error", "Nahrávejte prosím PDF.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      notify("error", "Soubor je větší než 25 MB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setPending("scan:upload");
    try {
      // Nahrát přímo do Vercel Blob z prohlížeče - obejde 4,5 MB limit těla
      // serverless funkce (jinak velký sken spadne na "Request Entity Too Large").
      const path = `portal/contracts/${contract.id}/scans/${Date.now()}-${scanSlug(file.name)}`;
      const blob = await upload(path, file, {
        access: "private",
        contentType: "application/pdf",
        handleUploadUrl: `/api/portal/contracts/${contract.id}/scan-upload`,
        multipart: file.size > 5 * 1024 * 1024,
      });
      // Zaevidovat hotový sken na smlouvu (malé JSON tělo, žádný limit).
      const res = await fetch(`/api/portal/contracts/${contract.id}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url, pathname: blob.pathname }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      const next = await reload();
      if (next) onChanged(next);
      notify("ok", "Sken nahrán, smlouva archivována.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Nahrání skenu selhalo.");
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
  const flow = getStatusFlowForType(contract.type);
  const idx = flow.indexOf(status);
  const nextStatus: ContractStatus | null =
    idx >= 0 && idx < flow.length - 1 ? flow[idx + 1]! : null;
  const isWithdrawalLike =
    contract.type === "withdrawal" || contract.type === "assignment-notice";
  // NDA se podepisuje elektronicky přes DigiSign (ne ručně + sken).
  const isNda = contract.type === "nda";
  const dsStatus = contract.digisignStatus;
  const isGated = isApprovalGated(contract.type);
  // Odstoupení a Postoupení smí z konceptu schválit jen admin - běžnému
  // uživateli skryjeme tlačítko (server to navíc tvrdě odmítne).
  const adminApprovalBlocked =
    requiresAdminToApproveDraft(contract.type) && !isAdmin;
  const approvalView = getApprovalView(contract, locationNewco);
  // V Konceptu (gated) předpovíme, zda po odeslání půjde auto, nebo ke schvalovatelům.
  const draftAuto = approvalView.kind === "draft" && approvalView.auto;
  const hasLocation = !!contract.locationId && !!contract.locationSnapshot;

  const downloadFinal = contract.generatedPdfUrl ? (
    <a
      href={`/api/portal/contracts/${contract.id}/download/generated`}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex h-11 items-center gap-2 rounded-full border border-edge bg-paper px-5 text-[13px] font-semibold text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
    >
      <Download className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      Finální PDF
    </a>
  ) : null;

  // Rollback (undo) aktuálního kroku - závisí na statusu.
  function rollbackFor(s: ContractStatus): React.ReactNode {
    if (s === "k-podpisu") {
      return (
        <SubtleButton
          onClick={unpickSigner}
          pending={pending === "DELETE:pick-signer"}
          Icon={Undo2}
        >
          {isWithdrawalLike
            ? "Zrušit přípravu k podpisu"
            : "Změnit podepisujícího"}
        </SubtleButton>
      );
    }
    if (s === "podepsano-bos") {
      return (
        <SubtleButton
          onClick={unmarkSignedBos}
          pending={pending === "DELETE:signed"}
          Icon={Undo2}
        >
          Zrušit Podepsáno BOS
        </SubtleButton>
      );
    }
    if (s === "podepsano-klientem") {
      return (
        <SubtleButton
          onClick={unmarkClientSigned}
          pending={pending === "DELETE:client-signed"}
          Icon={Undo2}
        >
          Zrušit Podepsáno klientem
        </SubtleButton>
      );
    }
    return undefined;
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-edge bg-paper px-6 py-6 md:px-8 md:py-7">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          Co teď
        </div>
      </div>

      {status === "koncept" && !isGated && (
        <ActionRow
          headline={
            adminApprovalBlocked
              ? "Čeká na schválení administrátora"
              : "Smlouva je v konceptu"
          }
          description={
            adminApprovalBlocked
              ? "Tento typ smlouvy může z konceptu schválit pouze administrátor."
              : `Dokud nezkontroluješ obsah a neschválíš ji, generuje se PDF s vodoznakem „NÁVRH".`
          }
          primary={
            adminApprovalBlocked ? undefined : (
              <PrimaryButton onClick={() => approve()} pending={pending === "POST:approve"} Icon={CheckCircle2}>
                Schválit smlouvu
              </PrimaryButton>
            )
          }
        />
      )}

      {status === "koncept" && isGated && (
        <ActionRow
          headline={hasLocation ? "Koncept - odešli ke schválení" : "Smlouva je v konceptu"}
          description={
            !hasLocation
              ? "Nejdřív vyber lokalitu v panelu „Lokalita a schválení“ níže. Podle ní se rozhodne o schválení."
              : draftAuto
                ? "Splňuje podmínky pro automatické schválení. Po odeslání bude rovnou schválena."
                : "Nesplňuje podmínky pro automatické schválení (důvody jsou v panelu „Lokalita a schválení“ níže). Po odeslání ji musí schválit schvalovatelé šablon."
          }
          primary={
            <PrimaryButton
              onClick={submitForApproval}
              pending={pending === "POST:submit"}
              Icon={Send}
              disabled={!hasLocation}
            >
              {draftAuto ? "Schválit smlouvu" : "Odeslat ke schválení"}
            </PrimaryButton>
          }
        />
      )}

      {status === "ke-schvaleni" && (
        <ActionRow
          headline={
            isApprover || isSuperadmin
              ? "Ke schválení - posuď a schval"
              : "Čeká na schválení schvalovatelů"
          }
          description={
            isApprover
              ? "Smlouva nesplnila podmínky automatického schválení (důvody jsou v panelu „Lokalita a schválení“ níže). Zkontroluj ji a schval, nebo vrať do konceptu."
              : isSuperadmin
                ? "Jako superadmin můžeš smlouvu schválit i mimo standardní proces - s povinnou poznámkou (proč, kdy a kým byla schválena)."
                : "Smlouva čeká na schválení schvalovatelů šablon. Připomenout e-mailem můžeš v panelu „Lokalita a schválení“ níže."
          }
          primary={
            isApprover ? (
              <PrimaryButton onClick={() => approve()} pending={pending === "POST:approve"} Icon={ShieldCheck}>
                Schválit
              </PrimaryButton>
            ) : isSuperadmin ? (
              <PrimaryButton
                onClick={() => setNoteModalOpen(true)}
                pending={pending === "POST:approve"}
                Icon={ShieldCheck}
              >
                Schválit s poznámkou
              </PrimaryButton>
            ) : undefined
          }
          rollback={
            <SubtleButton
              onClick={returnToDraft}
              pending={pending === "DELETE:submit"}
              Icon={Undo2}
            >
              Vrátit do konceptu
            </SubtleButton>
          }
        />
      )}

      {status === "schvaleno" &&
        (isWithdrawalLike ? (
          <ActionRow
            headline="Schváleno - připrav k podpisu"
            description="Smlouvu podepisuje pouze klient. Připrav finální PDF (bez vodoznaku), vytiskni a předej k podpisu."
            primary={
              <PrimaryButton
                onClick={prepareForSigning}
                pending={pending === "POST:pick-signer"}
                Icon={Gavel}
              >
                Připravit k podpisu
              </PrimaryButton>
            }
            rollback={
              <SubtleButton onClick={unapprove} pending={pending === "DELETE:approve"} Icon={Undo2}>
                Zrušit schválení
              </SubtleButton>
            }
          />
        ) : (
          <ActionRow
            headline="Schváleno - vyber podepisujícího"
            description="Vyber konkrétního podepisujícího. Po výběru se vygeneruje finální PDF bez vodoznaku."
            primary={
              <PrimaryButton onClick={() => setPickerOpen(true)} Icon={Gavel}>
                Vybrat podepisujícího
              </PrimaryButton>
            }
            rollback={
              isGated && contract.approvalDecision === "auto" ? (
                // Auto-schválené nemají krok schvalovatele - rollback vede rovnou
                // do konceptu (ne do Ke schválení).
                <SubtleButton
                  onClick={returnToDraft}
                  pending={pending === "DELETE:submit"}
                  Icon={Undo2}
                >
                  Vrátit do konceptu
                </SubtleButton>
              ) : (
                <SubtleButton onClick={unapprove} pending={pending === "DELETE:approve"} Icon={Undo2}>
                  Zrušit schválení
                </SubtleButton>
              )
            }
          />
        ))}

      {/* Mezikroky podpisů - akce se řídí dalším krokem ve flow daného typu
          (standard: BOS→klient, postoupení: klient→BOS, odstoupení: jen klient). */}
      {!isNda && nextStatus === "podepsano-bos" && (
        <ActionRow
          headline="Čeká na podpis BOS"
          description="Stáhni finální PDF, podepiš za BOS a označ jako Podepsáno BOS."
          primary={
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={markSignedBos} pending={pending === "POST:signed"} Icon={Stamp}>
                Označit Podepsáno BOS
              </PrimaryButton>
              {downloadFinal}
            </div>
          }
          rollback={rollbackFor(status)}
        />
      )}

      {isNda && status === "k-podpisu" && dsStatus !== "sent" && dsStatus !== "signed" && (
        <ActionRow
          headline="Připraveno k elektronickému podpisu"
          description="Odešle NDA přes DigiSign oběma stranám (BOServices i protistraně). Po podpisu se smlouva archivuje automaticky."
          primary={
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton
                onClick={sendDigisign}
                pending={pending === "POST:digisign-send"}
                Icon={Send}
              >
                Odeslat k podpisu (DigiSign)
              </PrimaryButton>
              {downloadFinal}
            </div>
          }
          rollback={rollbackFor(status)}
        />
      )}

      {isNda && dsStatus === "sent" && (
        <ActionRow
          headline="Odesláno k podpisu (DigiSign)"
          description="Čeká se na elektronický podpis obou stran. Po dokončení se podepsané PDF uloží a smlouva se archivuje automaticky."
          primary={
            <div className="flex flex-wrap items-center gap-2">{downloadFinal}</div>
          }
        />
      )}

      {!isNda && nextStatus === "podepsano-klientem" && (
        <ActionRow
          headline={
            isWithdrawalLike ? "Připraveno k podpisu klientem" : "Čeká na podpis klienta"
          }
          description="Předej finální PDF klientovi a po jeho podpisu označ jako Podepsáno klientem."
          primary={
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton
                onClick={markClientSigned}
                pending={pending === "POST:client-signed"}
                Icon={PenLine}
              >
                Označit Podepsáno klientem
              </PrimaryButton>
              {status === "k-podpisu" && downloadFinal}
            </div>
          }
          rollback={rollbackFor(status)}
        />
      )}

      {nextStatus === "archivovano" && (
        <ActionRow
          headline="Podepsáno - nahraj sken"
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
          rollback={rollbackFor(status)}
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
          ndaMode={isNda}
          onClose={() => setPickerOpen(false)}
          onPicked={pickSigner}
        />
      )}

      {noteModalOpen && (
        <ApprovalNoteModal
          pending={pending === "POST:approve"}
          onClose={() => setNoteModalOpen(false)}
          onConfirm={async (note) => {
            await approve(note);
            setNoteModalOpen(false);
          }}
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
  disabled,
  Icon,
  children,
}: {
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      className={BTN_PRIMARY}
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
      className={BTN_SUBTLE}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden={true} />
      {pending ? "…" : children}
    </button>
  );
}
