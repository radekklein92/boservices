import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { setBrandConceptMap } from "@/lib/portal/pos/pairing-db";
import { bustPosPairing } from "@/lib/portal/revalidate";

const CONCEPTS = ["TK", "KoP", "BB", "OXO", "RAK", "VD", "MFP", "KoFi", "Cinname", "Rio", "Pitstop", "other"] as const;

// Mapa značka (DW brand id) -> koncept portálu. Prázdná/odebraná hodnota = bez mapování.
const schema = z.record(z.string(), z.enum(CONCEPTS));

export async function PUT(req: Request) {
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
  await setBrandConceptMap(parsed.data);
  bustPosPairing();
  return NextResponse.json({ ok: true });
}
