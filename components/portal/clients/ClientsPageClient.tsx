"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import type { Client } from "@/lib/portal/clients-db";
import { ClientsTable } from "./ClientsTable";
import { ClientCreateModal } from "./ClientCreateModal";

export function ClientsPageClient({ initial }: { initial: Client[] }) {
  const router = useRouter();
  const [clients, setClients] = useState(initial);
  const [open, setOpen] = useState(false);

  async function refetch() {
    try {
      const res = await fetch("/api/portal/clients", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok && Array.isArray(data.clients)) {
        setClients(data.clients as Client[]);
      }
    } catch {
      // ignore
    }
  }

  function handleCreated() {
    setOpen(false);
    void refetch();
    router.refresh();
  }

  function handleDeleted(id: string) {
    setClients((prev) => prev.filter((c) => c.id !== id));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Klienti"
        title="Klienti"
        lede="Značky, pro které provozujeme prodejny. Z klienta pak generujete smlouvu."
        actions={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13.5px] font-semibold text-paper transition-transform active:translate-y-px"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Nový klient
          </button>
        }
      />

      <ClientsTable
        clients={clients}
        onAddClick={() => setOpen(true)}
        onDeleted={handleDeleted}
      />

      {open && (
        <ClientCreateModal
          onClose={() => setOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
