import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustLocations } from "@/lib/portal/revalidate";
import { getLocation, patchLocationLocal } from "@/lib/portal/locations-db";

// Poznámka RE k lokalitě (žije jen v BOServices, sync se jí nedotýká). Oddělená
// od obecné poznámky (endpoint /note) — vlastní sloupec v Real Estate tabulce.
// Zápis přes patchLocationLocal, aby se nezahodila ostatní lokální pole
// (note, newco, přílohy).

const schema = z.object({ reNote: z.string().max(8000) });

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const loc = await getLocation(id);
  if (!loc) {
    return NextResponse.json({ ok: false, error: "Lokalita nenalezena" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed" }, { status: 400 });
  }

  const updated = await patchLocationLocal(
    id,
    { reNote: parsed.data.reNote },
    g.session.user!.email!,
  );
  bustLocations();

  return NextResponse.json({ ok: true, updatedAt: updated.updatedAt });
}
