import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  buildLiveSnapshot,
  currentWeekMeta,
  getReSnapshots,
} from "@/lib/portal/re-snapshots-db";

// Data pro graf „Vývoj v čase" na stránce Real Estate. Vrací uložené týdenní
// snímky (každé pondělí cron) + ŽIVÝ bod aktuálního (rozdělaného) týdne počítaný
// realtime. Aktuální týden z uložených snímků vyřadíme (kdyby se náhodou objevil)
// — řídí ho výhradně živý bod, ať se nezdvojí. Smí každý přihlášený.

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const now = new Date();
  const [snapshots, live] = await Promise.all([
    getReSnapshots(),
    buildLiveSnapshot(now),
  ]);

  const { weekKey } = currentWeekMeta(now);
  const recorded = snapshots.filter((s) => s.weekKey !== weekKey);

  return NextResponse.json({ ok: true, snapshots: recorded, live });
}
