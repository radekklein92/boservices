import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { parsePosFilter, serializePosFilter } from "@/lib/portal/pos/filters";
import { PosLocationDetailBody, resolvePosLocationMeta } from "@/components/portal/pos/PosLocationDetail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tržby - Detail prodejny" };

function searchParamsToUsp(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") usp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") usp.set(k, v[0]);
  }
  return usp;
}

// Samostatná stránka detailu prodejny. Otevírá se ze žebříčku Prodejny (klik na
// celý řádek) i přímým odkazem. Detail = výběr zúžený na jednu lokalitu.
export default async function PosLocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const { locationId: raw } = await params;
  const locationId = decodeURIComponent(raw);
  const baseFilter = parsePosFilter(searchParamsToUsp(await searchParams));
  const { name, cur, filter, useNet } = await resolvePosLocationMeta(locationId, baseFilter);

  const backQs = serializePosFilter(baseFilter).toString();
  const backHref = `/portal/pos/prodejny${backQs ? `?${backQs}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={backHref} className="inline-flex items-center gap-1.5 transition-colors hover:text-ink-base">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Prodejny
          </Link>
        }
        title={name}
      />
      <PosLocationDetailBody filter={filter} cur={cur} useNet={useNet} />
    </>
  );
}
