import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { getClient } from "@/lib/portal/clients-db";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { ClientDetail } from "@/components/portal/clients/ClientDetail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  return { title: client?.companyName ?? "Klient" };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow={
          <Link
            href="/portal/clients"
            className="text-ink-mid transition-colors hover:text-ink-base"
          >
            ← Klienti
          </Link>
        }
        title={client.companyName}
        lede={`${client.legalForm === "PO" ? "Právnická osoba" : "Fyzická osoba"}${client.ico ? ` · IČO ${client.ico}` : ""}`}
        actions={
          <Link
            href={`/portal/clients/${client.id}/edit`}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-edge px-5 text-[13.5px] font-semibold text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            Upravit
          </Link>
        }
      />

      <ClientDetail client={client} />
    </div>
  );
}
