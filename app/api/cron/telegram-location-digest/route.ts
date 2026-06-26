import { NextResponse } from "next/server";
import { runTelegramLocationDigest } from "@/lib/portal/telegram-digest";

// Digest „stav lokalit" pro RE agenty (vercel.json cron, út+čt 6:00 UTC).
// Pošle každému agentovi do jeho Telegram skupiny zprávy za lokality vyžadující
// pozornost. Dokud TELEGRAM_BOT_TOKEN / mapování skupin nejsou nastaveny, vrací
// 2xx no-op (ať cron nehlásí chybu) — stejný vzor jako sync crony.
// ?dryRun=1 vrátí náhled zpráv bez odeslání (pro ruční test).

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

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const result = await runTelegramLocationDigest("cron", { dryRun });
  return NextResponse.json(result);
}
