import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustLocations } from "@/lib/portal/revalidate";
import { getLocation, patchLocationLocal } from "@/lib/portal/locations-db";

// Příznak „stejně řešit" u červené lokality (flaggedRed). Žije v BOServices
// (LocationLocal.solveDespiteRed), sync se jí nedotýká. Smí každý přihlášený.
// Zápis přes patchLocationLocal, aby se nezahodila ostatní lokální pole
// (note, flagIds, newco, přílohy). Sémantika ve filtru: červená + tento příznak
// = zůstane v „Červeně" a navíc se vždy započítá do „Řešit".

const schema = z.object({ value: z.boolean() });

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
    { solveDespiteRed: parsed.data.value },
    g.session.user!.email!,
  );
  bustLocations();

  return NextResponse.json({ ok: true, value: updated.solveDespiteRed ?? false });
}
