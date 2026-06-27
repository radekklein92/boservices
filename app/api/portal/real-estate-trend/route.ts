import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { buildReTrendPoints } from "@/lib/portal/re-snapshots-db";

// Data pro graf „Vývoj v čase" na stránce Real Estate (modal). Vrací body grafu:
// uložené týdenní snímky (každé pondělí cron) + ŽIVÝ bod aktuálního týdne jako
// poslední. Smí každý přihlášený. (Dashboard si tytéž body bere server-side
// přímo přes buildReTrendPoints, bez tohoto endpointu.)

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const points = await buildReTrendPoints(new Date());
  return NextResponse.json({ ok: true, points });
}
