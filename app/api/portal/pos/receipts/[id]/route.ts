import { NextResponse } from "next/server";
import { requirePOS } from "@/lib/portal/auth-guard";
import { getReceiptDetail } from "@/lib/portal/pos/queries";

export const dynamic = "force-dynamic";

// Detail jedné účtenky pro modal v seznamu (/portal/pos/uctenky). Server-side
// cachované (posQuery, zarovnané na sync DW), takže opakované otevření je levné.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePOS();
  if (!g.ok) return g.response;
  const { id } = await params;

  try {
    const receipt = await getReceiptDetail(id);
    return NextResponse.json({ ok: true, receipt });
  } catch {
    return NextResponse.json({ ok: false, error: "Účtenku se nepodařilo načíst" }, { status: 502 });
  }
}
