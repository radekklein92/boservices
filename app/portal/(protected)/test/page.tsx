import { PageHeader } from "@/components/portal/shell/PageHeader";

export const metadata = { title: "Testovací stránka" };

export default function TestPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Provoz"
        title="Testovací stránka"
        lede="Toto je nová testovací stránka."
      />
    </div>
  );
}
