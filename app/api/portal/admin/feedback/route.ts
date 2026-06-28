import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { listFeedbackDrafts } from "@/lib/portal/feedback-db";

export const dynamic = "force-dynamic";

// GET: nevyřízené návrhy z feedback widgetu pro Konzoli změn. Čtení vidí každý
// admin; spuštění implementace (promote) je dál gated requireChangeEditor.
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.response;
  const drafts = await listFeedbackDrafts("pending", 100);
  return NextResponse.json({ ok: true, drafts });
}
