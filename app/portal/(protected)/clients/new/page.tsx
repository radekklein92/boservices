import { PageHeader } from "@/components/portal/shell/PageHeader";
import { ClientForm } from "@/components/portal/clients/ClientForm";

export const metadata = { title: "Nový klient" };

export default function NewClientPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Nový klient"
        title="Přidat klienta"
        lede="Stačí IČO — zbytek dotáhneme z ARES. Statutární zástupce a kontakt si pak doplníte sami."
      />
      <ClientForm mode={{ kind: "create" }} />
    </div>
  );
}
