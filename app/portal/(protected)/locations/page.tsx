import { getLocationsBrainstorm } from "@/lib/portal/locations-notes-db";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { LocationsBrainstorm } from "@/components/portal/locations/LocationsBrainstorm";
import {
  MapPin,
  Building,
  Wallet,
  Settings,
  PhoneCall,
  ClipboardCheck,
  FileCheck2,
  Files,
  Construction,
} from "lucide-react";

export const metadata = { title: "Lokality" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const note = await getLocationsBrainstorm();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Provoz"
        title="Lokality"
        lede="Evidence prostor pro provozovny - nájemní smlouvy, podmínky, podklady a kontaktní osoby. Modul se připravuje. Tady sbíráme nápady, jaké informace bychom o lokalitách měli evidovat."
      />

      <div className="rounded-3xl border border-edge bg-paper-warm p-7 md:p-9">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink-base text-paper">
            <Construction className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-mid">
              Připravujeme
            </div>
            <h2 className="text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
              Co tu jednou bude
            </h2>
          </div>
        </div>

        <p className="mt-4 max-w-[68ch] text-[13.5px] leading-relaxed text-ink-deep">
          Lokalita = konkrétní prostor (provozovna), který buď BOServices, nebo
          franšízant pronajímá. Ke každé lokalitě budeme držet pohromadě
          nájemní smlouvu, finanční podmínky, kontakt na pronajímatele a
          podklady. Cílem je mít na jednom místě všechno, co by oblastní
          manažer mohl o lokalitě potřebovat.
        </p>

        <div className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <FeatureCard
            Icon={MapPin}
            title="Identifikace"
            items={[
              "Adresa a typ prostor (OC, ulice, retail park)",
              "Plocha v m²",
              "Koncept (Trdlokafe, Kytky od Pepy, Bubblify)",
              "Vazba na klienta-franšízanta",
            ]}
          />
          <FeatureCard
            Icon={FileCheck2}
            title="Smlouva"
            items={[
              "Nájemce v záhlaví (BOServices / franšízant)",
              "Délka nájmu (od - do), výpovědní doba",
              "Předčasné ukončení a sankce",
              "Možnost podnájmu",
            ]}
          />
          <FeatureCard
            Icon={Wallet}
            title="Finance"
            items={[
              "Měsíční nájemné a měna (CZK / EUR / PLN)",
              "DPH (s nebo bez)",
              "Mechanismus růstu (CPI / fixní % p.a.)",
              "Kauce, marketingový fond, parkování",
            ]}
          />
          <FeatureCard
            Icon={Settings}
            title="Provoz"
            items={[
              "Služby pronajímatele (správa, úklid, ostraha)",
              "Energie (jak jsou účtované)",
              "Otevírací doba povinná dle pronajímatele",
              "Další pravidelné poplatky",
            ]}
          />
          <FeatureCard
            Icon={PhoneCall}
            title="Kontakty"
            items={[
              "Kontaktní osoba pronajímatele",
              "E-mail a telefon",
              "Eskalační linka pro krize",
            ]}
          />
          <FeatureCard
            Icon={Building}
            title="Stav"
            items={[
              "Aktivní / před otevřením / ukončený / volný",
              "Datum předání a otevření",
              "Historie změn",
            ]}
          />
          <FeatureCard
            Icon={ClipboardCheck}
            title="Compliance"
            items={[
              "Kolaudace, hygiena, pojištění",
              "BOZP a požární revize",
              "Plánované audity",
            ]}
          />
          <FeatureCard
            Icon={Files}
            title="Soubory"
            items={[
              "Originální nájemní smlouva PDF",
              "Dodatky a změny",
              "Předávací protokoly",
            ]}
          />
        </div>
      </div>

      <LocationsBrainstorm initial={note} />
    </div>
  );
}

function FeatureCard({
  Icon,
  title,
  items,
}: {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  items: string[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-edge bg-paper p-5">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-edge-warm text-ink-deep">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
        </div>
        <h3 className="text-[13.5px] font-bold tracking-[-0.01em] text-ink-base">
          {title}
        </h3>
      </div>
      <ul className="flex flex-col gap-1.5 text-[12.5px] leading-snug text-ink-mid">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-soft" />
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
