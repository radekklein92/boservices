import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import {
  getPayout,
  upsertPayout,
  PAYOUT_STATUS_LABEL,
} from "@/lib/portal/payouts-db";
import { salespersonEmailById } from "@/lib/portal/commissions";
import { notifyPayoutStatus } from "@/lib/email";
import { bustPayouts } from "@/lib/portal/revalidate";

const schema = z.object({
  status: z.enum(["fakturovano", "zadano-k-uhrade", "uhrazeno"]),
});

// Posun stavu výběru - jen admin (zadat k úhradě / uhrazeno; příp. vrátit zpět
// na fakturováno). Stav "uhrazeno" doplní paidAt/paidBy.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { id } = await params;
  const payout = await getPayout(id);
  if (!payout) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Neplatný stav." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const paid =
    parsed.data.status === "uhrazeno"
      ? { paidAt: now, paidBy: g.session.user!.email! }
      : { paidAt: undefined, paidBy: undefined };
  await upsertPayout({
    ...payout,
    status: parsed.data.status,
    ...paid,
    updatedAt: now,
  });
  bustPayouts();

  // E-mail obchodníkovi (vlastníkovi výběru) při skutečné změně stavu.
  if (payout.status !== parsed.data.status) {
    const to = salespersonEmailById(payout.salespersonId);
    if (to) {
      notifyPayoutStatus({
        to,
        amount: payout.amount,
        variableSymbol: payout.variableSymbol,
        statusLabel: PAYOUT_STATUS_LABEL[parsed.data.status],
        paid: parsed.data.status === "uhrazeno",
      }).catch((err) =>
        console.error("[payouts] notify salesperson failed", err),
      );
    }
  }

  return NextResponse.json({ ok: true });
}
