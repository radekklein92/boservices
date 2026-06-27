import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { setLocationPairing } from "@/lib/portal/pos/pairing-db";
import { bustPosPairing } from "@/lib/portal/revalidate";

// Location-primary párování: přiřadí pokladnu (dwShopId) na lokalitu, nebo ji
// odpojí (dwShopId=null). Admin only. Drží integritu 1 lokalita <-> 1 pokladna.
const schema = z.object({
  locationId: z.string().min(1),
  dwShopId: z.string().min(1).nullable(),
  city: z.string().trim().max(120).optional(),
  brandId: z.string().optional(),
  dwShopName: z.string().max(240).optional(),
});

export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Neplatná data" }, { status: 400 });
  }

  await setLocationPairing({ ...parsed.data, pairedBy: g.session.user?.email ?? "system" });
  bustPosPairing();
  return NextResponse.json({ ok: true });
}
