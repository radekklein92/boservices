import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { setShopIgnored } from "@/lib/portal/pos/pairing-db";
import { bustPosPairing } from "@/lib/portal/revalidate";

// Ignorování pokladny = vyřazení z aktivního seznamu k napárování (cizí provozovny
// mimo portál, akční/popup kasy, testovací). Vratné. Admin-only.
const schema = z.object({
  dwShopId: z.string().min(1),
  ignore: z.boolean(),
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

  await setShopIgnored(parsed.data.dwShopId, parsed.data.ignore);
  bustPosPairing();
  return NextResponse.json({ ok: true });
}
