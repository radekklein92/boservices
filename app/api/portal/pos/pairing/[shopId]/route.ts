import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { removeShopPair } from "@/lib/portal/pos/pairing-db";
import { bustPosPairing } from "@/lib/portal/revalidate";

// Odebrání párování (vč. osiřelých). Pozn.: odebírá celý záznam crosswalku.
export async function DELETE(_req: Request, { params }: { params: Promise<{ shopId: string }> }) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;
  const { shopId } = await params;
  await removeShopPair(shopId);
  bustPosPairing();
  return NextResponse.json({ ok: true });
}
