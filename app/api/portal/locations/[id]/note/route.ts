import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustLocations } from "@/lib/portal/revalidate";
import {
  getLocation,
  getLocationLocal,
  saveLocationLocal,
  type LocationLocal,
} from "@/lib/portal/locations-db";

// Lokální poznámka k lokalitě (žije jen v BOServices, sync se jí nedotýká).

const schema = z.object({ note: z.string().max(8000) });

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

  const existing = await getLocationLocal(id);
  const local: LocationLocal = {
    locationId: id,
    note: parsed.data.note,
    attachments: existing?.attachments ?? [],
    updatedBy: g.session.user!.email!,
    updatedAt: new Date().toISOString(),
  };
  await saveLocationLocal(local);
  bustLocations();

  return NextResponse.json({ ok: true, updatedAt: local.updatedAt });
}
