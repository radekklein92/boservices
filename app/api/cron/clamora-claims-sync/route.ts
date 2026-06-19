import { NextResponse } from "next/server";
import { runClamoraClaimsSync } from "@/lib/portal/clamora-claims-sync";

// Hodinová synchronizace postoupených pohledávek z ClamoraPortal (vercel.json
// cron). Dokud CLAMORA_CLAIMS_URL / CLAMORA_PUBLIC_TOKEN nejsou nastaveny, vrací
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

  const result = await runClamoraClaimsSync("cron");
  if (!result.ok && result.reason === "error") {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
