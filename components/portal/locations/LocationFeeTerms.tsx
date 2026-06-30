"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Pencil,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { Section } from "@/components/portal/ui/Section";
import { Chip } from "@/components/portal/ui/Chip";
import { BTN_ROW } from "@/components/portal/ui/buttons";
import { FeeTermsEditor } from "@/components/portal/contracts/FeeTermsEditor";
import {
  CONTRACT_TYPE_META,
  getVariantMeta,
  isApprovalGated,
} from "@/lib/portal/contract-types";
import {
  FEE_KIND_LABEL,
  displayPeriodEnd,
  formatFeePeriod,
  type ContractFeeTerms,
} from "@/lib/portal/contract-fee-terms";
import { maskWho } from "@/lib/portal/masked-account";
import { formatDate, formatDateTime } from "./locations-shared";
import type { LocationContractRow } from "./LocationDetail";

const SOURCE_LABEL: Record<ContractFeeTerms["source"], string> = {
  ai: "AI",
  manual: "Ručně",
  "ai-edited": "AI + úpravy",
};

const CONFIDENCE_TONE: Record<ContractFeeTerms["aiConfidence"], string> = {
  high: "border-emerald-300 bg-emerald-50 text-emerald-700",
  medium: "border-sky-300 bg-sky-50 text-sky-700",
  low: "border-amber-300 bg-amber-50 text-amber-700",
  none: "border-edge bg-edge-warm text-ink-mid",
};

const CONFIDENCE_LABEL: Record<ContractFeeTerms["aiConfidence"], string> = {
  high: "vysoká jistota",
  medium: "střední jistota",
  low: "nízká jistota",
  none: "bez údaje",
};

function contractLabel(c: LocationContractRow): string {
  const meta = CONTRACT_TYPE_META[c.type];
  const variant = c.variant ? getVariantMeta(c.type, c.variant) : null;
  // Krátký variant suffix (A/B) jen u franšízy.
  const vshort = variant && c.type === "franchise" ? ` ${c.variant === "AB" ? "A" : "B"}` : "";
  return `${meta.shortName}${vshort}`;
}

// Jeden řádek tabulky = jedna poplatková perioda jedné smlouvy.
type FeeRow = {
  key: string;
  contractLabel: string;
  firstOfContract: boolean;
  periodLabel: string;
  rate: string;
  from: string; // ISO nebo ""
  to: string; // ISO nebo "" (= dle franšízy / bez konce)
  pending?: string; // text místo dat (čeká/chyba/neuvedeno)
};

function buildRows(
  contracts: LocationContractRow[],
  franchiseEndDate: string,
): FeeRow[] {
  const rows: FeeRow[] = [];
  for (const c of contracts) {
    const label = contractLabel(c);
    const ft = c.feeTerms;
    if (ft && ft.periods.length > 0) {
      ft.periods.forEach((p, i) => {
        rows.push({
          key: `${c.id}:${p.id}`,
          contractLabel: label,
          firstOfContract: i === 0,
          periodLabel: p.label || FEE_KIND_LABEL[p.kind],
          rate: formatFeePeriod(p, ft.currency),
          from: p.from,
          to: displayPeriodEnd(p, franchiseEndDate),
        });
      });
    } else {
      rows.push({
        key: c.id,
        contractLabel: label,
        firstOfContract: true,
        periodLabel: "—",
        rate: "—",
        from: "",
        to: "",
        pending: c.feeTermsError
          ? "chyba extrakce"
          : "poplatky se zpracovávají",
      });
    }
  }
  return rows;
}

export function LocationFeeTermsSection({
  contracts,
  franchiseEndDate,
}: {
  contracts: LocationContractRow[];
  franchiseEndDate: string;
}) {
  const eligible = contracts.filter(
    (c) =>
      !c.cancelled &&
      isApprovalGated(c.type) &&
      (c.feeTerms || c.clientSignedAt || c.feeTermsError),
  );
  if (eligible.length === 0) return null;

  const rows = buildRows(eligible, franchiseEndDate);

  return (
    <Section
      title="Poplatky a fakturace"
      hint="Vytaženo ze smlouvy AI při podpisu, ručně upravitelné. Podklad pro budoucí fakturaci klientovi."
    >
      <div className="overflow-x-auto rounded-2xl border border-edge">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["Smlouva", "Poplatek", "Sazba", "Od", "Do"].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap border-b border-edge bg-paper-warm px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-mid"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="transition-colors hover:bg-paper-warm">
                <td className="border-t border-edge px-3 py-2.5 align-middle font-medium text-ink-base">
                  {r.firstOfContract ? r.contractLabel : ""}
                </td>
                <td className="border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                  {r.pending ? (
                    <span className="text-ink-soft">{r.pending}</span>
                  ) : (
                    r.periodLabel
                  )}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle font-medium text-ink-base">
                  {r.pending ? "—" : r.rate}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                  {r.from ? formatDate(r.from) : "—"}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                  {r.pending ? "—" : r.to ? formatDate(r.to) : "dle franšízové smlouvy"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {eligible.map((c) => (
          <FeeManageRow key={c.id} contract={c} />
        ))}
      </div>
    </Section>
  );
}

// Per smlouva: metadata (zdroj, jistota, poznámky) + akce (Upravit / Obnovit z AI)
// + inline editor. Tabulka výše zobrazuje data; tady je správa.
function FeeManageRow({ contract }: { contract: LocationContractRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terms = contract.feeTerms;

  async function runExtract(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/contracts/${contract.id}/fee-terms${force ? "?force=1" : ""}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (res.status === 409 && data.locked) {
        if (
          window.confirm(
            "Poplatky byly ručně upraveny. Opravdu je přepsat tím, co načte AI ze smlouvy?",
          )
        ) {
          setBusy(false);
          return runExtract(true);
        }
        setBusy(false);
        return;
      }
      if (!data.ok) throw new Error(data.error || "Načtení z AI selhalo.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Načtení z AI selhalo.");
    } finally {
      setBusy(false);
    }
  }

  const invoicingNote =
    terms && terms.invoicingStartsFrom && terms.invoicingStartsFrom !== terms.effectiveFrom
      ? `Fakturace od ${formatDate(terms.invoicingStartsFrom)}`
      : "";

  return (
    <div className="rounded-xl border border-edge bg-paper px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/portal/contracts/${contract.id}`}
            className="group inline-flex items-center gap-1 text-[13px] font-medium text-ink-base hover:text-ink-deep"
          >
            <span>{contractLabel(contract)}</span>
            <ArrowUpRight
              className="h-3 w-3 shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </Link>
          {terms && (
            <>
              <Chip tone="border-edge bg-edge-warm text-ink-mid">{SOURCE_LABEL[terms.source]}</Chip>
              {terms.source !== "manual" && (
                <Chip tone={CONFIDENCE_TONE[terms.aiConfidence]}>
                  {CONFIDENCE_LABEL[terms.aiConfidence]}
                </Chip>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing((v) => !v)} className={BTN_ROW}>
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            {terms ? "Upravit" : "Doplnit ručně"}
          </button>
          <button type="button" onClick={() => runExtract(false)} disabled={busy} className={BTN_ROW}>
            {terms ? (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            )}
            {busy ? "Načítám…" : terms ? "Obnovit z AI" : "Načíst z AI"}
          </button>
        </div>
      </div>

      {(invoicingNote || terms?.aiNotes || (terms?.updatedAt && terms.source !== "ai")) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-soft">
          {invoicingNote && <span>{invoicingNote}</span>}
          {terms?.aiNotes && <span>Pozn. AI: {terms.aiNotes}</span>}
          {terms?.updatedAt && terms.source !== "ai" && (
            <span>
              Upraveno {formatDateTime(terms.updatedAt)}
              {terms.updatedBy ? ` · ${maskWho(terms.updatedBy)}` : ""}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          {error}
        </div>
      )}

      {editing && (
        <div className="mt-3 border-t border-edge pt-4">
          <FeeTermsEditor
            contractId={contract.id}
            contractType={contract.type}
            initial={terms}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}

