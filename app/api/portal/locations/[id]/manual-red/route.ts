import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustLocations } from "@/lib/portal/revalidate";
import { getLocation, patchLocationLocal } from "@/lib/portal/locations-db";

// Ruční označení lokality „Červeně" (mimo import NewCo). Žije v BOServices
// (LocationLocal.manualRed), sync ani reimport NewCo se ho nedotýká. Smí každý
// přihlášený. Zápis přes patchLocationLocal, aby se nezahodila ostatní lokální
// pole (note, flagIds, newco, solveDespiteRed, přílohy).
// Sémantika je shodná s flaggedRed z importu: červená = samostatná kategorie
// „Červeně" (defaultně skrytá), s příznakem solveDespiteRed se navíc ukáže
// i v „Řešit". Strukturně držíme kdo/kdy, ať jde v UI odlišit ruční označení
// od importu. value=false ruční příznak zruší (na importní červenou nemá vliv).

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

  const email = g.session.user!.email!;
  const manualRed = parsed.data.value
    ? { by: email, at: new Date().toISOString() }
    : undefined;

  const updated = await patchLocationLocal(id, { manualRed }, email);
  bustLocations();

  return NextResponse.json({ ok: true, manualRed: updated.manualRed ?? null });
}
