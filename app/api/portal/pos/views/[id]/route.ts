import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePOS, isAdminRole } from "@/lib/portal/auth-guard";
import { deleteView, getView, updateView } from "@/lib/portal/pos/views-db";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  filter: z.string().max(2000).optional(),
  shared: z.boolean().optional(),
});

// Editovat/mazat smí autor pohledu nebo admin. (Číst sdílené smí každý s POS.)
function canMutate(ownerEmail: string, session: { user?: { email?: string | null; role?: string } }): boolean {
  const email = session.user?.email?.toLowerCase();
  if (email && ownerEmail.toLowerCase() === email) return true;
  return isAdminRole(session.user?.role as never);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePOS();
  if (!g.ok) return g.response;
  const { id } = await params;

  const view = await getView(id);
  if (!view) return NextResponse.json({ ok: false, error: "Pohled neexistuje" }, { status: 404 });
  if (!canMutate(view.ownerEmail, g.session)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Neplatná data" }, { status: 400 });

  const updated = await updateView(id, parsed.data);
  return NextResponse.json({ ok: true, view: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePOS();
  if (!g.ok) return g.response;
  const { id } = await params;

  const view = await getView(id);
  if (!view) return NextResponse.json({ ok: true }); // idempotentní
  if (!canMutate(view.ownerEmail, g.session)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  await deleteView(id);
  return NextResponse.json({ ok: true });
}
