"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { BTN_PRIMARY } from "@/components/portal/ui/buttons";
import { XlsxDownloadButton } from "@/components/portal/shared/XlsxDownloadButton";
import { buildClientsXlsx } from "@/lib/portal/clients-export";
import type { Client } from "@/lib/portal/clients-db";
import type { ClientContractBadge } from "@/lib/portal/client-contract-status";
import { ClientsTable, matchClientQuery } from "./ClientsTable";
import { ClientCreateModal } from "./ClientCreateModal";

export function ClientsPageClient({
  initial,
  badgesByClient,
}: {
  initial: Client[];
  badgesByClient: Record<string, ClientContractBadge[]>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Hledání drží rodič (ne ClientsTable), aby XLS export v hlavičce mohl
  // vyexportovat přesně ten seznam, který je po filtru na stránce vidět.
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => initial.filter((c) => matchClientQuery(c, query)),
    [initial, query],
  );

  // Po mutaci necháme server přepočítat (klienti i ikonky stavů smluv).
  function handleCreated() {
    setOpen(false);
    router.refresh();
  }

  function handleDeleted() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Franšízing"
        title="Klienti"
        lede="Značky, pro které provozujeme prodejny. Z klienta pak generujete smlouvu."
        actions={
          <>
            <XlsxDownloadButton
              build={() => buildClientsXlsx(filtered)}
              filename={`klienti-${new Date().toISOString().slice(0, 10)}.xlsx`}
              disabled={filtered.length === 0}
              title="Stáhne zobrazené klienty (vč. e-mailů, IČO, DIČ, telefonů) do Excelu (.xlsx)"
            />
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={BTN_PRIMARY}
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              Nový klient
            </button>
          </>
        }
      />

      <ClientsTable
        clients={initial}
        filtered={filtered}
        query={query}
        onQueryChange={setQuery}
        badgesByClient={badgesByClient}
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
