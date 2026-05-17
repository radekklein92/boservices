import Link from "next/link";
import { Plus } from "lucide-react";
import { listClients } from "@/lib/portal/clients-db";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { ClientsTable } from "@/components/portal/clients/ClientsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Klienti" };

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Klienti"
        title="Klienti"
        lede="Značky, pro které provozujeme prodejny. Z klienta pak generujete smlouvu."
        actions={
          <Link
            href="/portal/clients/new"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13.5px] font-semibold text-paper transition-transform active:translate-y-px"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Nový klient
          </Link>
        }
      />

      <ClientsTable initial={clients} />
    </div>
  );
}
