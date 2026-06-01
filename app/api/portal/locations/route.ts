import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { cachedListLocations } from "@/lib/portal/cached-db";

// Lehký seznam lokalit pro picker (výběr lokality u smlouvy). Projekce jen
// polí, která picker a klíč ke schválení potřebují - ať se nepřenáší celý
// zrcadlený objekt z Transition.
export type LocationPickItem = {
  id: string;
  name: string;
  code: string | null;
  concept: string;
  category: string | null;
  leaseStatus: string;
  newMode: string | null;
};

export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const locations = await cachedListLocations();
  const items: LocationPickItem[] = locations.map((l) => ({
    id: l.id,
    name: l.name,
    code: l.code,
    concept: l.concept,
    category: l.category,
    leaseStatus: l.lease_current_status,
    newMode: l.new_mode,
  }));

  return NextResponse.json({ ok: true, locations: items });
}
