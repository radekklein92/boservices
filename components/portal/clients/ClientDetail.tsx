import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import type { Client } from "@/lib/portal/clients-db";
import {
  clientSignedAtEffective,
  contractDisplayStatus,
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_STYLE,
  type Contract,
} from "@/lib/portal/contracts-db";
import { CONTRACT_TYPE_META, getVariantMeta, isApprovalGated } from "@/lib/portal/contract-types";
import {
  displayPeriodEnd,
  FEE_KIND_LABEL,
  formatFeePeriod,
} from "@/lib/portal/contract-fee-terms";
import { Section } from "@/components/portal/ui/Section";
import { InfoRow as Row } from "@/components/portal/ui/InfoRow";
import { Chip } from "@/components/portal/ui/Chip";
import { CONTRACT_STATUS_ICON } from "@/components/portal/contracts/contract-status-meta";
import { FeeHistorySection } from "@/components/portal/fees/FeeHistorySection";
import type { FeeHistoryEntry } from "@/lib/portal/fees-page";

const LEGAL_LABEL: Record<string, string> = {
  PO: "Právnická osoba",
  FO: "Fyzická osoba",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Prague",
    });
  } catch {
    return iso;
  }
}

export function ClientDetail({
  client,
  contracts,
  feeHistory,
}: {
  client: Client;
  contracts: Contract[];
  feeHistory: FeeHistoryEntry[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Section title="Základní údaje">
          <Row label="Forma" value={LEGAL_LABEL[client.legalForm] ?? client.legalForm} />
          <Row label="Obchodní jméno" value={client.companyName} />
          {client.ico && <Row label="IČO" value={client.ico} mono />}
          {client.dic && <Row label="DIČ" value={client.dic} mono />}
        </Section>

        <Section title="Sídlo">
          <Row label="Ulice" value={client.address.street} />
          <Row label="Obec" value={client.address.city} />
          <Row label="PSČ" value={client.address.zip} mono />
          <Row label="Stát" value={client.address.country ?? "—"} />
        </Section>

        {client.statutory && (
          <Section title="Statutární zástupce">
            <Row label="Jméno" value={client.statutory.name} />
            <Row label="Funkce" value={client.statutory.role ?? "—"} />
          </Section>
        )}

        {client.contact && (
          <Section title="Kontaktní osoba">
            {client.contact.name && <Row label="Jméno" value={client.contact.name} />}
            {client.contact.email && (
              <Row
                label="E-mail"
                value={
                  <a
                    href={`mailto:${client.contact.email}`}
                    className="underline underline-offset-2 transition-opacity hover:opacity-70"
                  >
                    {client.contact.email}
                  </a>
                }
              />
            )}
            {client.contact.phone && <Row label="Telefon" value={client.contact.phone} mono />}
          </Section>
        )}

        <Section title="Záznam">
          <Row label="Přidáno" value={formatDate(client.createdAt)} />
          <Row label="Naposledy upraveno" value={formatDate(client.updatedAt)} />
        </Section>
      </div>

      <ClientFeeSummary contracts={contracts} />
      <FeeHistorySection entries={feeHistory} showLocation />

      <ContractsSection clientId={client.id} contracts={contracts} />
    </div>
  );
}

function feeContractLabel(c: Contract): string {
  const short = CONTRACT_TYPE_META[c.type].shortName;
  if (c.type === "franchise" && c.variant && getVariantMeta(c.type, c.variant)) {
    return `${short} ${c.variant === "AB" ? "A" : "B"}`;
  }
  return short;
}

function fmtFeeDate(iso: string): string {
  return iso ? formatDate(iso) : "";
}

// Souhrn poplatků napříč lokalitami klienta (read-only) v jedné tabulce. Edituje
// se na detailu lokality. Jen approval-gated podepsané smlouvy; konec u spolupráce/
// provozování = konec franšízy téže lokality.
function ClientFeeSummary({ contracts }: { contracts: Contract[] }) {
  const eligible = contracts.filter(
    (c) =>
      !c.cancelledAt &&
      isApprovalGated(c.type) &&
      c.locationId &&
      (c.feeTerms || clientSignedAtEffective(c)),
  );
  if (eligible.length === 0) return null;

  const groups = new Map<string, { name: string; rows: Contract[] }>();
  for (const c of eligible) {
    const id = c.locationId!;
    const existing = groups.get(id);
    if (existing) existing.rows.push(c);
    else groups.set(id, { name: c.locationSnapshot?.name ?? "Lokalita", rows: [c] });
  }

  type TRow = {
    key: string;
    locationId: string;
    locationName: string;
    firstOfLocation: boolean;
    contractLabel: string;
    firstOfContract: boolean;
    periodLabel: string;
    rate: string;
    from: string;
    to: string;
    pending?: string;
  };
  const rows: TRow[] = [];
  for (const [locationId, group] of groups) {
    // Konec franšízy lokality - od něj se odvozuje konec spolupráce/provozování.
    const franchiseEnd =
      group.rows.find((c) => c.type === "franchise" && c.feeTerms?.termEndsAt)?.feeTerms
        ?.termEndsAt ?? "";
    let firstLoc = true;
    for (const c of group.rows) {
      const label = feeContractLabel(c);
      const ft = c.feeTerms;
      if (ft && ft.periods.length > 0) {
        ft.periods.forEach((p, i) => {
          rows.push({
            key: `${c.id}:${p.id}`,
            locationId,
            locationName: group.name,
            firstOfLocation: firstLoc,
            contractLabel: label,
            firstOfContract: i === 0,
            periodLabel: p.label || FEE_KIND_LABEL[p.kind],
            rate: formatFeePeriod(p, ft.currency),
            from: p.from,
            to: displayPeriodEnd(p, franchiseEnd),
          });
          firstLoc = false;
        });
      } else {
        rows.push({
          key: c.id,
          locationId,
          locationName: group.name,
          firstOfLocation: firstLoc,
          contractLabel: label,
          firstOfContract: true,
          periodLabel: "—",
          rate: "—",
          from: "",
          to: "",
          pending: c.feeTermsError ? "chyba extrakce" : "zpracovává se",
        });
        firstLoc = false;
      }
    }
  }

  return (
    <Section
      title="Poplatky a fakturace"
      hint="Souhrn ze všech lokalit klienta. Vytaženo ze smluv, upravit lze na detailu lokality."
    >
      <div className="overflow-x-auto rounded-2xl border border-edge">
        <table className="w-full border-collapse text-[13px] tabular-nums">
          <thead>
            <tr>
              {["Lokalita", "Smlouva", "Poplatek", "Sazba", "Od", "Do"].map((h) => (
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
                <td className="border-t border-edge px-3 py-2.5 align-middle">
                  {r.firstOfLocation ? (
                    <Link
                      href={`/portal/locations/${r.locationId}`}
                      className="group inline-flex items-center gap-1 font-medium text-ink-base hover:text-ink-deep"
                    >
                      <span>{r.locationName}</span>
                      <ArrowUpRight
                        className="h-3 w-3 shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </Link>
                  ) : (
                    ""
                  )}
                </td>
                <td className="border-t border-edge px-3 py-2.5 align-middle text-ink-base">
                  {r.firstOfContract ? r.contractLabel : ""}
                </td>
                <td className="border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                  {r.pending ? <span className="text-ink-soft">{r.pending}</span> : r.periodLabel}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle font-medium text-ink-base">
                  {r.pending ? "—" : r.rate}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                  {fmtFeeDate(r.from) || "—"}
                </td>
                <td className="whitespace-nowrap border-t border-edge px-3 py-2.5 align-middle text-ink-deep">
                  {r.pending ? "—" : fmtFeeDate(r.to) || "dle franšízové smlouvy"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function ContractsSection({
  clientId,
  contracts,
}: {
  clientId: string;
  contracts: Contract[];
}) {
  if (contracts.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-edge bg-paper p-7 text-center">
        <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink-base">
          Smlouvy
        </div>
        <h3 className="mt-2 text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
          Žádné smlouvy pro tohoto klienta.
        </h3>
        <p className="mt-2 text-[13px] text-ink-mid">
          Smlouvu vytvoříte v sekci Smlouvy → Nová smlouva → vyberete tohoto
          klienta.
        </p>
        <Link
          href="/portal/contracts"
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-full border border-edge bg-paper px-4 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
        >
          Otevřít Smlouvy
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-edge bg-paper">
      <div className="flex items-center justify-between gap-3 border-b border-edge px-5 py-4 md:px-7">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink-base">
            Smlouvy
          </h2>
          <span className="font-mono text-[11.5px] text-ink-soft">
            {contracts.length.toString().padStart(2, "0")}
          </span>
        </div>
        <Link
          href="/portal/contracts"
          className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-ink-mid transition-colors hover:text-ink-base"
        >
          Všechny smlouvy →
        </Link>
      </div>
      <ul className="divide-y divide-edge">
        {contracts.map((c) => {
          const meta = CONTRACT_TYPE_META[c.type];
          // Zobrazovaný stav (u DigiSign mezistavu „Podepsáno klientem").
          const displayStatus = contractDisplayStatus(c);
          const StatusIcon = CONTRACT_STATUS_ICON[displayStatus];
          return (
            <li key={c.id}>
              <Link
                href={`/portal/contracts/${c.id}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper-warm md:px-7"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-edge bg-paper-warm text-ink-deep">
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold tracking-[-0.01em] text-ink-base">
                    {meta.fullName}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-ink-mid">
                    {c.number && (
                      <span className="font-mono">{c.number}</span>
                    )}
                    <span>{formatDate(c.createdAt)}</span>
                  </div>
                </div>
                <Chip tone={CONTRACT_STATUS_STYLE[displayStatus]} className="hidden sm:inline-flex">
                  <StatusIcon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  {CONTRACT_STATUS_LABEL[displayStatus]}
                </Chip>
                <ArrowUpRight
                  className="h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-edge px-5 py-3.5 md:px-7">
        <span className="text-[11px] text-ink-mid">
          Novou smlouvu pro {" "}
          <Link
            href="/portal/contracts"
            className="font-medium text-ink-base underline underline-offset-2 transition-opacity hover:opacity-70"
          >
            vytvořte v sekci Smlouvy
          </Link>
          {" "} a v modalu vyberte tohoto klienta (ID: <code className="font-mono">{clientId}</code>).
        </span>
      </div>
    </section>
  );
}

