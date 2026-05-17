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
  const [open, setOpen] = useState(false);

  function handleCreated(id?: string) {
    setOpen(false);
    if (id) {
      router.push(`/portal/clients/${id}`);
    } else {
      router.refresh();
    }
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

      <ClientsTable initial={initial} onAddClick={() => setOpen(true)} />

      {open && (
        <ClientCreateModal
          onClose={() => setOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
