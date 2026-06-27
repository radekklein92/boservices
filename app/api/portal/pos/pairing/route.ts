import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { upsertShopPair } from "@/lib/portal/pos/pairing-db";
import { bustPosPairing } from "@/lib/portal/revalidate";

// Párování pobočka<->lokalita je admin-only (i když POS data vidí manager).
const CONCEPTS = ["TK", "KoP", "BB", "OXO", "RAK", "VD", "MFP", "KoFi", "Cinname", "Rio", "Pitstop", "other"] as const;

const schema = z.object({
  dwShopId: z.string().min(1),
  locationId: z.string().min(1).nullable().optional(),
  city: z.string().trim().max(120).optional(),
  brandId: z.string().optional(),
  dwShopName: z.string().max(240).optional(),
  concept: z.enum(CONCEPTS).optional(),
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

  const pair = await upsertShopPair({
    ...parsed.data,
    pairedBy: g.session.user?.email ?? "system",
    pairedAt: new Date().toISOString(),
    status: parsed.data.locationId ? "active" : "unpaired",
  });
  bustPosPairing();
  return NextResponse.json({ ok: true, pair });
}
