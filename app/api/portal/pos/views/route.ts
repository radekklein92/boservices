import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePOS } from "@/lib/portal/auth-guard";
import { createView } from "@/lib/portal/pos/views-db";

// Uložené POS pohledy vidí/zakládá každý s přístupem k POS (manager+). Editaci a
// mazání sdílených pohledů hlídá [id] routa (autor|admin).
const schema = z.object({
  name: z.string().trim().min(1).max(60),
  filter: z.string().max(2000),
  shared: z.boolean().optional(),
});

export async function POST(req: Request) {
  const g = await requirePOS();
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

  const ownerEmail = g.session.user?.email;
  if (!ownerEmail) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const view = await createView(parsed.data, ownerEmail);
    return NextResponse.json({ ok: true, view });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Uložení selhalo" },
      { status: 400 },
    );
  }
}
