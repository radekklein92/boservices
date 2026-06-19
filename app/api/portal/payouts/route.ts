import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRole, requireSession } from "@/lib/portal/auth-guard";
import {
  cachedGetClaimsOverlay,
  cachedListContracts,
} from "@/lib/portal/cached-db";
import {
  buildCommissionsView,
  salespersonByEmail,
  salespersonName,
  type SalespersonId,
} from "@/lib/portal/commissions";
import {
  COMMISSION_PAYER,
  getNextPayoutVs,
  listPayoutsBySalesperson,
  newPayoutId,
  salespersonAvailable,
  upsertPayout,
  type Payout,
} from "@/lib/portal/payouts-db";
import { bustPayouts } from "@/lib/portal/revalidate";

const billingSchema = z.object({
  name: z.string().trim().min(1).max(200),
  ico: z.string().trim().max(20).optional(),
  dic: z.string().trim().max(20).optional(),
  isVatPayer: z.boolean(),
  address: z.string().trim().max(300).optional(),
  bankAccount: z.string().trim().max(60).optional(),
});
const createSchema = z.object({
  salespersonId: z.enum(["toman", "ebermann"]).optional(), // jen admin pro někoho jiného
  amount: z.number().finite().positive(),
  billing: billingSchema,
  // Odběratel se nezadává - je vždy COMMISSION_PAYER.
});

// Vytvoření výběru provize. Obchodník vybírá pro sebe; admin může zadat
// salespersonId. Částka je validovaná proti "k dispozici" (provize - vybráno).
export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const email = g.session.user!.email!;
  const isAdmin = isAdminRole(g.session.user?.role);
  const me = salespersonByEmail(email);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Neplatný vstup." }, { status: 400 });
  }

  // Cílový obchodník: admin může zadat libovolného (salespersonId), jinak self.
  let targetId: SalespersonId;
  if (isAdmin && parsed.data.salespersonId) targetId = parsed.data.salespersonId;
  else if (me) targetId = me.id;
  else {
    return NextResponse.json(
      { ok: false, error: "Nemáte oprávnění vytvořit výběr." },
      { status: 403 },
    );
  }

  const [contracts, overlay, theirPayouts] = await Promise.all([
    cachedListContracts(),
    cachedGetClaimsOverlay(),
    listPayoutsBySalesperson(targetId),
  ]);
  const view = buildCommissionsView(contracts, overlay);
  const commission =
    view.bySalesperson.find((s) => s.id === targetId)?.total ?? 0;
  const available = salespersonAvailable(commission, theirPayouts);
  const amount = Math.round(parsed.data.amount);
  if (amount <= 0 || amount > available) {
    return NextResponse.json(
      { ok: false, error: `Lze vybrat nejvýše ${available} Kč.` },
      { status: 422 },
    );
  }

  const now = new Date().toISOString();
  const payout: Payout = {
    id: newPayoutId(),
    salespersonId: targetId,
    merchantName: salespersonName(targetId),
    amount,
    variableSymbol: await getNextPayoutVs(),
    status: "podklad",
    billing: parsed.data.billing,
    customer: COMMISSION_PAYER,
    createdBy: email,
    createdAt: now,
    updatedAt: now,
  };
  await upsertPayout(payout);
  bustPayouts();
  return NextResponse.json({ ok: true, payout });
}
