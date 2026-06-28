import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePOS } from "@/lib/portal/auth-guard";
import { getView, setDefaultView } from "@/lib/portal/pos/views-db";

// Výchozí pohled je per-uživatel. Nastavit lze vlastní nebo sdílený pohled (ne cizí
// soukromý). null = zrušit výchozí.
const schema = z.object({ viewId: z.string().min(1).nullable() });

export async function PUT(req: Request) {
  const g = await requirePOS();
  if (!g.ok) return g.response;
  const email = g.session.user?.email;
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Neplatná data" }, { status: 400 });

  const { viewId } = parsed.data;
  if (viewId) {
    const view = await getView(viewId);
    if (!view) return NextResponse.json({ ok: false, error: "Pohled neexistuje" }, { status: 404 });
    const isOwn = view.ownerEmail.toLowerCase() === email.toLowerCase();
    if (!isOwn && !view.shared) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }
  await setDefaultView(email, viewId);
  return NextResponse.json({ ok: true });
}
