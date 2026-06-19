import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { isAdminRole, requireSession } from "@/lib/portal/auth-guard";
import { salespersonByEmail } from "@/lib/portal/commissions";
import { deletePayout, getPayout } from "@/lib/portal/payouts-db";
import { bustPayouts } from "@/lib/portal/revalidate";

// Zrušení výběru - jen ve stavu "podklad" (bez faktury), vlastník nebo admin.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const isAdmin = isAdminRole(g.session.user?.role);
  const me = salespersonByEmail(g.session.user!.email!);

  const { id } = await params;
  const payout = await getPayout(id);
  if (!payout) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (!isAdmin && me?.id !== payout.salespersonId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (payout.status !== "podklad") {
    return NextResponse.json(
      { ok: false, error: "Zrušit lze jen výběr ve stavu Čeká na fakturu." },
      { status: 409 },
    );
  }

  if (payout.invoicePath && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(payout.invoicePath);
    } catch (err) {
      console.error("[payouts] blob delete failed", err);
    }
  }

  await deletePayout(id);
  bustPayouts();
  return NextResponse.json({ ok: true });
}
