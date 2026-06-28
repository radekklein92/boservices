import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { getFeedbackDraft, resolveFeedbackDraft } from "@/lib/portal/feedback-db";

export const dynamic = "force-dynamic";

// POST: „Zamítnout / Hotovo" - návrh vyřídí mimo automatické spuštění (Radek si
// ho vyřeší sám, nebo je nerelevantní). Stačí admin (nic to nespouští).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { id } = await params;
  const draft = await getFeedbackDraft(id);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "Návrh nenalezen." }, { status: 404 });
  }
  if (draft.status !== "pending") {
    return NextResponse.json({ ok: true, id }); // idempotentní
  }

  await resolveFeedbackDraft(id, {
    status: "dismissed",
    resolvedByEmail: g.session.user?.email ?? "",
  });
  return NextResponse.json({ ok: true, id });
}
