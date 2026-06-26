import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustLocations } from "@/lib/portal/revalidate";
import {
  effectiveReAgent,
  getLocation,
  patchLocationLocal,
} from "@/lib/portal/locations-db";

// Lokální přiřazení RE agenta k lokalitě (žije jen v BOServices, sync se jí
// nedotýká, má přednost před Transition re_agent). null = smazat lokální volbu
// → spadne zpět na Transition. Hodnoty enumu musí ladit s typem ReAgent.

const schema = z.object({
  reAgent: z
    .enum(["Krampera", "Siarik", "Kholova", "Gransky", "Neuzil"])
    .nullable(),
});

export async function PATCH(
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
    { reAgent: parsed.data.reAgent },
    g.session.user!.email!,
  );
  bustLocations();

  return NextResponse.json({
    ok: true,
    reAgent: updated.reAgent ?? null,
    // Autoritativní hodnota pro klienta (lokální volba ?? Transition ?? null).
    effectiveReAgent: effectiveReAgent(loc, updated),
    updatedAt: updated.updatedAt,
  });
}
