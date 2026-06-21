import { NextResponse } from "next/server";
import { listPayouts, upsertPayout } from "@/lib/portal/payouts-db";
import { notifyPayoutOverdue } from "@/lib/email";

// Vercel Cron Job. vercel.json: "0 */12 * * *" (každých 12 h) - aby se 48h práh
// chytil s malým driftem.
//
// Výběry provize ve stavu „Zadáno k úhradě" déle než 48 h, které nikdo neoznačil
// jako uhrazené, připomene adminovi e-mailem. Připomínka se opakuje à 48 h:
// kotvou je overdueRemindedAt (posune se po každém odeslání), před prvním
// remindrem updatedAt (= čas vstupu do stavu; status route ho při změně nastaví
// a overdueRemindedAt vyčistí). Když se stav změní na „Uhrazeno", výběr z filtru
// vypadne a připomínání ustane.
//
// Autentizace stejná jako u ostatních cronů: Authorization: Bearer <CRON_SECRET>
// (na local devu bez CRON_SECRET se auth přeskočí).

const OVERDUE_MS = 48 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const overdue = (await listPayouts()).filter((p) => {
    if (p.status !== "zadano-k-uhrade") return false;
    const anchor = p.overdueRemindedAt ?? p.updatedAt;
    return now - new Date(anchor).getTime() >= OVERDUE_MS;
  });

  if (overdue.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: false,
      message: "Žádný výběr nečeká na úhradu déle než 48 h.",
    });
  }

  // E-mail nejdřív; okno posuneme až po úspěšném odeslání, ať se připomínka
  // neztratí, když Resend selže (radši duplicitní e-mail než žádný).
  try {
    await notifyPayoutOverdue(
      overdue.map((p) => ({
        merchantName: p.merchantName,
        amount: p.amount,
        variableSymbol: p.variableSymbol,
        queuedSince: p.updatedAt,
      })),
    );
  } catch (err) {
    console.error("[payouts-overdue] e-mail failed", err);
    return NextResponse.json({ ok: false, error: "E-mail selhal." }, { status: 500 });
  }

  await Promise.all(
    overdue.map((p) => upsertPayout({ ...p, overdueRemindedAt: nowIso })),
  );

  return NextResponse.json({
    ok: true,
    sent: true,
    count: overdue.length,
    variableSymbols: overdue.map((p) => p.variableSymbol),
  });
}
