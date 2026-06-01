"use client";

import { Check } from "lucide-react";
import {
  CONTRACT_STATUS_LABEL,
  getStatusFlowForType,
  statusOrder,
  type Contract,
  type ContractStatus,
} from "@/lib/portal/contracts-db";

// Mapuje status → timestamp pole, ze kterého čteme datum dokončení kroku.
// Pro `koncept` čteme z createdAt - to je moment vzniku.
const STATUS_TIMESTAMP_FIELD: Record<ContractStatus, keyof Contract> = {
  koncept: "createdAt",
  "ke-schvaleni": "submittedForApprovalAt",
  schvaleno: "approvedAt",
  "k-podpisu": "signerPickedAt",
  "podepsano-bos": "signedAt",
  "podepsano-klientem": "clientSignedAt",
  archivovano: "scanUploadedAt",
};

function formatStepDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.getDate()}.${d.getMonth() + 1}. ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

export function ContractStatusStepper({
  contract,
  signerLabel,
}: {
  contract: Contract;
  // Pro krok "K podpisu" zobrazujeme jméno podepisujícího jako sub-line.
  // Předáváme zvlášť, protože komponenta neřeší User lookup.
  signerLabel?: string | null;
}) {
  const current = contract.status;
  const flow = getStatusFlowForType(contract.type);
  // Když je smlouva už ve statusu, který v jejím flow neexistuje (např. data
  // ze starého času před zavedením unilateral flow), spadne to do max(flow).
  const currentIdx =
    flow.indexOf(current) === -1
      ? Math.min(statusOrder(current), flow.length - 1)
      : flow.indexOf(current);
  // Délka linky je responzivní - na úzké flow (4 kroky) by 640px byla obří.
  const minWidth = flow.length <= 4 ? 480 : 640;

  return (
    <div className="rounded-2xl border border-edge bg-paper px-6 py-7 md:px-8 md:py-8">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          Stav smlouvy
        </div>
        <div className="text-[12.5px] font-semibold text-ink-base">
          {CONTRACT_STATUS_LABEL[current]}
        </div>
      </div>

      {/* Stepper. Na úzkých zařízeních scrolluje horizontálně. */}
      <div className="-mx-2 overflow-x-auto px-2 pb-1">
        <ol
          className="relative flex items-start gap-0"
          style={{ minWidth: `${minWidth}px` }}
        >
          {flow.map((status, idx) => {
            const isDone = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const isFuture = idx > currentIdx;
            const field = STATUS_TIMESTAMP_FIELD[status];
            const ts = formatStepDate(contract[field] as string | undefined);
            const subline =
              isCurrent && status === "k-podpisu" && signerLabel
                ? signerLabel
                : isDone || isCurrent
                  ? ts
                  : "";

            return (
              <li
                key={status}
                className="relative flex flex-1 flex-col items-center text-center"
              >
                {/* Propojovací linka mezi tečkou a další tečkou - nakreslíme ji
                    z LEVÉ poloviny do PRAVÉ. První step nemá levou, poslední pravou. */}
                {idx > 0 && (
                  <span
                    className={`absolute left-0 right-1/2 top-[18px] h-[2px] -translate-y-1/2 ${
                      idx <= currentIdx ? "bg-ink-base" : "bg-edge"
                    }`}
                    aria-hidden="true"
                  />
                )}
                {idx < flow.length - 1 && (
                  <span
                    className={`absolute left-1/2 right-0 top-[18px] h-[2px] -translate-y-1/2 ${
                      idx < currentIdx ? "bg-ink-base" : "bg-edge"
                    }`}
                    aria-hidden="true"
                  />
                )}

                {/* Číslo nad tečkou */}
                <div
                  className={`mb-1 text-[10.5px] font-semibold tracking-wider ${
                    isFuture ? "text-ink-soft" : "text-ink-mid"
                  }`}
                >
                  {idx + 1}
                </div>

                {/* Tečka */}
                <div
                  className={[
                    "relative z-10 grid h-9 w-9 place-items-center rounded-full transition-colors",
                    isDone && "bg-ink-base text-paper",
                    isCurrent &&
                      "bg-ink-base text-paper ring-4 ring-ink-base/12",
                    isFuture && "border border-edge bg-paper text-ink-soft",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isDone && (
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                  )}
                  {isCurrent && (
                    <span className="h-2 w-2 rounded-full bg-paper" aria-hidden="true" />
                  )}
                </div>

                {/* Label */}
                <div
                  className={[
                    "mt-2.5 px-1 text-[12.5px] leading-snug tracking-[-0.005em]",
                    isCurrent && "font-bold text-ink-base",
                    isDone && "font-medium text-ink-base",
                    isFuture && "text-ink-mid",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {CONTRACT_STATUS_LABEL[status]}
                </div>

                {/* Sub-line: timestamp pro hotové, jméno signera pro K podpisu */}
                {subline && (
                  <div className="mt-0.5 text-[10.5px] leading-snug text-ink-mid">
                    {subline}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
