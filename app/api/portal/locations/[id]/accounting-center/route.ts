import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { bustLocations } from "@/lib/portal/revalidate";
import { getLocation, patchLocationLocal } from "@/lib/portal/locations-db";

// Účetní středisko lokality (zkratka z POHODY, žije jen v BOServices — sync
// z Transition ani reimport NewCo se ho nedotknou). Sdílené s Real Estate
// tabulkou i detailem lokality. Na rozdíl od poznámky je editace ADMIN-ONLY.
// Zápis přes patchLocationLocal, aby se nezahodila ostatní lokální pole.

const schema = z.object({ value: z.string().max(120) });

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireAdmin();
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
    { accountingCenter: parsed.data.value.trim() },
    g.session.user!.email!,
  );
  bustLocations();

  return NextResponse.json({ ok: true, updatedAt: updated.updatedAt });
}
