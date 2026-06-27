import { NextResponse } from "next/server";
import {
  computeCurrentReconCounts,
  lastEndedWeekMeta,
  saveReSnapshot,
} from "@/lib/portal/re-snapshots-db";

// Pondělní snímek počtů Real Estate (vercel.json cron: "0 1 * * 1"). Zaznamená
// počty Řešit / Vyřešeno / Červeně za PRÁVĚ UPLYNULÝ týden — bod v grafu dosedne
// na neděli toho týdne. Idempotentní: re-run týž týden přepíše stejný klíč.
// Bez Redisu vrací 2xx no-op (ať cron nehlásí chybu).

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const { weekKey, weekEnd } = lastEndedWeekMeta(now);
    const counts = await computeCurrentReconCounts();
    await saveReSnapshot({
      weekKey,
      weekEnd,
      ...counts,
      capturedAt: now.toISOString(),
    });
    return NextResponse.json({ ok: true, weekKey, weekEnd, ...counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    // Redis nenakonfigurovaný → no-op 2xx; jiná chyba → 500.
    if (message === "Redis not configured") {
      return NextResponse.json({ ok: true, skipped: "no-redis" });
    }
    console.error("[re-trend-snapshot] selhalo", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
