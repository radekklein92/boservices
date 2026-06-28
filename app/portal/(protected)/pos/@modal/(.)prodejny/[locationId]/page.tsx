import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { parsePosFilter } from "@/lib/portal/pos/filters";
import { PosLocationDetailBody, resolvePosLocationMeta } from "@/components/portal/pos/PosLocationDetail";
import { PosModal } from "@/components/portal/pos/PosModal";

export const dynamic = "force-dynamic";

function searchParamsToUsp(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") usp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") usp.set(k, v[0]);
  }
  return usp;
}

// Intercepting route: detail prodejny otevřený ze žebříčku se zobrazí jako modal
// (nad seznamem) místo nové stránky. Stejný obsah jako plná stránka.
export default async function PosLocationModal({
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

  return (
    <PosModal title={name}>
      <PosLocationDetailBody filter={filter} cur={cur} useNet={useNet} />
    </PosModal>
  );
}
