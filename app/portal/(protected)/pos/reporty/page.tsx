import { Suspense } from "react";
import { Download } from "lucide-react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { posFilterFromSearchParams, serializePosFilter, DATE_PRESET_LABEL } from "@/lib/portal/pos/filters";
import { resolveDisplayCurrency } from "@/lib/portal/pos/queries";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { PosSubNav } from "@/components/portal/pos/PosSubNav";
import { PosFilterBarLoader } from "@/components/portal/pos/PosFilterBarLoader";
import { FilterBarSkeleton } from "@/components/portal/pos/skeletons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tržby - Reporty" };

export default async function PosReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const filter = posFilterFromSearchParams(await searchParams);
  const qs = serializePosFilter(filter).toString();
  const href = (type: string) => `/api/portal/pos/export?type=${type}${qs ? `&${qs}` : ""}`;
  // Měna, ve které export reálně poběží (efektivní měna výběru). Bezpečně - když
  // POS není nakonfigurováno, zůstane zvolená měna.
  let cur = filter.currency;
  try {
    cur = await resolveDisplayCurrency(filter);
  } catch {
    /* fallback na filter.currency */
  }

  return (
    <>
      <PageHeader
        eyebrow="Provoz"
        title="Reporty"
        lede="Exporty dat pro aktuální výběr a období."
      />

      <PosSubNav />

      <Suspense fallback={<FilterBarSkeleton />}>
        <PosFilterBarLoader filter={filter} />
      </Suspense>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
          Export ({DATE_PRESET_LABEL[filter.preset]}, {cur})
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ExportCard
            href={href("produkty")}
            title="Produkty"
            body="Top produkty dle tržeb pro aktuální filtr (množství, tržby s/bez DPH, Ø cena)."
          />
          <ExportCard
            href={href("uctenky")}
            title="Účtenky"
            body="Účtenky pro aktuální filtr (čas, prodejna, částky, DPH, kanál, refundace)."
          />
        </div>
        <p className="text-[11px] text-ink-soft">
          Exporty žebříčků a analytik (heatmapa, platby, DPH split) přibudou po nasazení DW endpointů.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Slovníček pojmů</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Term term="Tržby s DPH (hrubé)" desc="Tržby včetně DPH, bez refundací." />
          <Term term="Tržby bez DPH (čisté)" desc="Tržby s DPH minus DPH (net = gross - vat), bez refundací." />
          <Term term="Průměrný ticket (ATV)" desc="Tržby dělené počtem účtenek." />
          <Term term="Transakce = účtenky" desc="Počítáme účtenky, ne hosty (počet hostů zdroj neposkytuje)." />
          <Term term="Prodejna vs pokladna" desc="Prodejna = portálová lokalita; jedna prodejna může mít více pokladen (dim_shop). Vše sčítáme na prodejny." />
          <Term term="Koncept" desc="Skupina prodejen (TK, KoP, BB…) podle konceptu lokality." />
          <Term term="DPH 12 % vs 21 %" desc="Jídlo zpravidla 12 %, nápoje vč. čepovaného piva 21 % (od 1/2024)." />
          <Term term="Refundace" desc="Doklady označené jako vratka; nižší míra je lepší." />
          <Term term="Předchozí rok" desc="Srovnání posunuté o 52 týdnů (zarovnané dny v týdnu)." />
          <Term term="Měny" desc="Segmentováno per měna (CZK/EUR/PLN…), bez přepočtu kurzem." />
        </dl>
      </section>
    </>
  );
}

function ExportCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <a
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-edge bg-paper p-5 transition-colors hover:border-ink-base"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-edge-warm text-ink-base transition-colors group-hover:bg-ink-base group-hover:text-paper">
        <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-[14px] font-semibold text-ink-base">{title}</span>
        <span className="text-[12.5px] leading-snug text-ink-mid">{body}</span>
        <span className="mt-0.5 text-[11.5px] font-medium text-ink-mid">Stáhnout XLSX</span>
      </span>
    </a>
  );
}

function Term({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-edge bg-paper p-4">
      <dt className="text-[13px] font-semibold text-ink-base">{term}</dt>
      <dd className="mt-1 text-[12.5px] leading-snug text-ink-mid">{desc}</dd>
    </div>
  );
}
