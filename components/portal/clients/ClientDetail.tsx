import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import type { Client } from "@/lib/portal/clients-db";
import {
  contractDisplayStatus,
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_STYLE,
  type Contract,
} from "@/lib/portal/contracts-db";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
import { Section } from "@/components/portal/ui/Section";
import { InfoRow as Row } from "@/components/portal/ui/InfoRow";
import { Chip } from "@/components/portal/ui/Chip";
import { CONTRACT_STATUS_ICON } from "@/components/portal/contracts/contract-status-meta";

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
    });
  } catch {
    return iso;
  }
}

export function ClientDetail({
  client,
  contracts,
}: {
  client: Client;
  contracts: Contract[];
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

      <ContractsSection clientId={client.id} contracts={contracts} />
    </div>
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
      <section className="rounded-[24px] border border-dashed border-edge bg-paper p-7 text-center">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
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
    <section className="rounded-[24px] border border-edge bg-paper">
      <div className="flex items-center justify-between gap-3 border-b border-edge px-5 py-4 md:px-7">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mid">
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

