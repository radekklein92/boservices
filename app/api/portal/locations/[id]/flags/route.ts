import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustLocations } from "@/lib/portal/revalidate";
import { getLocation, patchLocationLocal } from "@/lib/portal/locations-db";

// Přiřazení uživatelských flagů k lokalitě (žije v BOServices, sync se jí
// nedotýká). Smí každý přihlášený. Zápis přes patchLocationLocal, aby se
// nezahodila ostatní lokální pole (note, reNote, newco, přílohy). Katalog flagů
// (definice) je v /api/portal/re-flags.

const schema = z.object({ flagIds: z.array(z.string().min(1)).max(50) });

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

  // Dedup — pole je množina flagů, ne sekvence.
  const flagIds = [...new Set(parsed.data.flagIds)];
  const updated = await patchLocationLocal(id, { flagIds }, g.session.user!.email!);
  bustLocations();

  return NextResponse.json({ ok: true, flagIds: updated.flagIds ?? [] });
}
