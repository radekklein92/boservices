import Link from "next/link";
import type { Client } from "@/lib/portal/clients-db";

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

export function ClientDetail({ client }: { client: Client }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card title="Základní údaje">
        <Row label="Forma" value={LEGAL_LABEL[client.legalForm] ?? client.legalForm} />
        <Row label="Obchodní jméno" value={client.companyName} />
        {client.ico && <Row label="IČO" value={client.ico} mono />}
        {client.dic && <Row label="DIČ" value={client.dic} mono />}
      </Card>

      <Card title="Sídlo">
        <Row label="Ulice" value={client.address.street} />
        <Row label="Obec" value={client.address.city} />
        <Row label="PSČ" value={client.address.zip} mono />
        <Row label="Stát" value={client.address.country ?? "—"} />
      </Card>

      {client.statutory && (
        <Card title="Statutární zástupce">
          <Row label="Jméno" value={client.statutory.name} />
          <Row label="Funkce" value={client.statutory.role ?? "—"} />
        </Card>
      )}

      {client.contact && (
        <Card title="Kontaktní osoba">
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
        </Card>
      )}

      <Card title="Záznam">
        <Row label="Přidáno" value={formatDate(client.createdAt)} />
        <Row label="Naposledy upraveno" value={formatDate(client.updatedAt)} />
      </Card>

      <div className="md:col-span-2">
        <div className="rounded-[24px] border border-dashed border-edge bg-paper p-7 text-center">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
            Smlouvy
          </div>
          <h3 className="mt-2 text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
            Generování smluv je v přípravě.
          </h3>
          <p className="mt-2 text-[13px] text-ink-mid">
            V další fázi sem doplníme 6 šablon a generování PDF pro tohoto klienta.
          </p>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-edge bg-paper p-7">
      <h2 className="mb-5 text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mid">
        {title}
      </h2>
      <dl className="flex flex-col gap-4 text-[14px]">{children}</dl>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <dt className="text-[12px] uppercase tracking-[0.12em] text-ink-mid">{label}</dt>
      <dd
        className={[
          "text-ink-base",
          mono ? "font-mono tracking-tight" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
