import { NextResponse } from "next/server";
import { runLocationsSync } from "@/lib/portal/locations-sync";

// Hodinová synchronizace lokalit z Transition (vercel.json cron).
// Dokud TRANSITION_LOCATIONS_URL / TRANSITION_API_TOKEN nejsou nastaveny, vrací
// 2xx no-op (ať cron nehlásí chybu). Skutečná chyba syncu vrací 500.

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

  const result = await runLocationsSync("cron");
  if (!result.ok && result.reason === "error") {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
