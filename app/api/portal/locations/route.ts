import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { listLocations, listLocationNewcoMap } from "@/lib/portal/locations-db";

// Picker lokalit musí být vždy čerstvý (hned po synchronizaci). Čteme přímo
// z Redisu (bez unstable_cache) a odpověď je no-store, ať ji nedrží browser.
export const dynamic = "force-dynamic";

// Lehký seznam lokalit pro picker (výběr lokality u smlouvy). Projekce jen
// polí, která picker a klíč ke schválení potřebují - ať se nepřenáší celý
// zrcadlený objekt z Transition. NewCo souhrn slouží k náhledu klíče schválení.
export type LocationPickItem = {
  id: string;
  name: string;
  code: string | null;
  concept: string;
  category: string | null;
  leaseStatus: string;
  newMode: string | null;
  newco: { inFile: boolean; entitaCeip1: string; operationalType: string } | null;
};

export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const [locations, newcoMap] = await Promise.all([
    listLocations(),
    listLocationNewcoMap(),
  ]);
  const items: LocationPickItem[] = locations.map((l) => ({
    id: l.id,
    name: l.name,
    code: l.code,
    concept: l.concept,
    category: l.category,
    leaseStatus: l.lease_current_status,
    newMode: l.new_mode,
    newco: newcoMap.get(l.id) ?? null,
  }));

  return NextResponse.json(
    { ok: true, locations: items },
    { headers: { "Cache-Control": "no-store" } },
  );
}
