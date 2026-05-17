import { notFound } from "next/navigation";
import Link from "next/link";
import { getClient } from "@/lib/portal/clients-db";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { ClientForm } from "@/components/portal/clients/ClientForm";

export const metadata = { title: "Upravit klienta" };

export default async function EditClientPage({
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
            href={`/portal/clients/${client.id}`}
            className="text-ink-mid transition-colors hover:text-ink-base"
          >
            ← {client.companyName}
          </Link>
        }
        title="Upravit klienta"
      />
      <ClientForm mode={{ kind: "edit", clientId: client.id, initial: client }} />
    </div>
  );
}
