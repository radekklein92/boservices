"use client";

import { Check, Ban } from "lucide-react";
import {
  contractDisplayStatus,
  CONTRACT_STATUS_LABEL,
  displayStatusFlow,
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
  zrusena: "cancelledAt",
};

// Zobrazovaný stav (vč. DigiSign mezistavu) a pořadí podpisových kroků řeší
// sdílené helpery contractDisplayStatus / displayStatusFlow v contracts-db - aby
// osa na detailu, badge i chip v seznamu počítaly stav konzistentně.

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
  submitterLabel,
}: {
  contract: Contract;
  // Pro krok "K podpisu" zobrazujeme jméno podepisujícího jako sub-line.
  // Předáváme zvlášť, protože komponenta neřeší User lookup.
  signerLabel?: string | null;
  // Jméno toho, kdo smlouvu poslal z konceptu (odeslal ke schválení / schválil).
  // Zobrazí se u prvního kroku po Konceptu (flow[1]).
  submitterLabel?: string | null;
}) {
  // Zrušená smlouva není krok ve flow - místo zavádějícího „vše hotovo"
  // stepperu vykreslíme jasný terminální stav.
  if (contract.status === "zrusena") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/60 px-6 py-6 md:px-8 md:py-7">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
            Stav smlouvy
          </div>
          <div className="text-[12.5px] font-semibold text-red-600">Zrušená</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-600">
            <Ban className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="text-[13px] leading-relaxed text-ink-deep">
            Smlouva byla zrušená
            {contract.cancelledAt ? ` ${formatStepDate(contract.cancelledAt)}` : ""}
            {contract.cancelledByName ? ` (${contract.cancelledByName})` : ""}.
            Nezapočítává se do provizí ani do čísel na dashboardu.
            {contract.cancelReason ? ` Důvod: ${contract.cancelReason}` : ""}
          </div>
        </div>
      </div>
    );
  }

  const flow = displayStatusFlow(contract);
  // Aktuální krok = zobrazovaný stav (u DigiSign mezistavu „podepsano-klientem"),
  // konzistentně s chipem v seznamu, panelem „Co teď" i čísly na dashboardu.
  // U ručního flow je displayStatus = computed status, takže beze změny.
  const displayStatus = contractDisplayStatus(contract);
  const idx = flow.indexOf(displayStatus);
  const currentIdx = idx === -1 ? 0 : idx;
  // Délka linky je responzivní - na úzké flow (4 kroky) by 640px byla obří.
  const minWidth = flow.length <= 4 ? 480 : 640;

  return (
    <div className="rounded-2xl border border-edge bg-paper px-6 py-6 md:px-8 md:py-7">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          Stav smlouvy
        </div>
        <div className="text-[12.5px] font-semibold text-ink-base">
          {CONTRACT_STATUS_LABEL[displayStatus]}
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
            // U „Podepsáno klientem" bereme i DigiSign mezistav (digisignClientSignedAt)
            // a označíme ho - vysvětluje, proč je krok hotový, i když finální
            // clientSignedAt ještě nedorazil a status v DB je „k-podpisu".
            const isClientStep = status === "podepsano-klientem";
            const viaDigisign =
              isClientStep &&
              !contract.clientSignedAt &&
              !!contract.digisignClientSignedAt;
            const stepIso = isClientStep
              ? (contract.clientSignedAt ?? contract.digisignClientSignedAt)
              : (contract[STATUS_TIMESTAMP_FIELD[status]] as string | undefined);
            const ts = formatStepDate(stepIso);
            const subline =
              isCurrent && status === "k-podpisu" && signerLabel
                ? signerLabel
                : isDone || isCurrent
                  ? viaDigisign && ts
                    ? `${ts} · DigiSign`
                    : ts
                  : "";

            return (
              <li
                key={status}
                className="relative flex flex-1 flex-col items-center text-center"
              >
                {/* Číslo nad tečkou */}
                <div
                  className={`mb-1 text-[10.5px] font-semibold tracking-wider ${
                    isFuture ? "text-ink-soft" : "text-ink-mid"
                  }`}
                >
                  {idx + 1}
                </div>

                {/* Řádek s tečkou + propojovací linkou. Linku centrujeme vertikálně
                    na tečku (top-1/2 vůči tomuto řádku), kreslíme z LEVÉ poloviny
                    do PRAVÉ. První step nemá levou, poslední pravou. */}
                <div className="relative flex w-full items-center justify-center">
                  {idx > 0 && (
                    <span
                      className={`absolute left-0 right-1/2 top-1/2 h-[2px] -translate-y-1/2 ${
                        idx <= currentIdx ? "bg-ink-base" : "bg-edge"
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  {idx < flow.length - 1 && (
                    <span
                      className={`absolute left-1/2 right-0 top-1/2 h-[2px] -translate-y-1/2 ${
                        idx < currentIdx ? "bg-ink-base" : "bg-edge"
                      }`}
                      aria-hidden="true"
                    />
                  )}

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

                {/* Kdo poslal z konceptu - u prvního kroku po Konceptu (flow[1]),
                    jakmile je dosažen. */}
                {idx === 1 && (isDone || isCurrent) && submitterLabel && (
                  <div className="mt-0.5 text-[10.5px] leading-snug text-ink-soft">
                    odeslal: {submitterLabel}
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
