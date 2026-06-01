import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { runLocationsSync } from "@/lib/portal/locations-sync";

// Manuální spuštění synchronizace z portálu ("Synchronizovat teď").
// Stejná logika jako cron, jen s identitou uživatele v sync-meta.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST() {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const result = await runLocationsSync(`manual:${g.session.user!.email}`);
  if (!result.ok && result.reason === "error") {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
