import { NextResponse } from "next/server";
import { z } from "zod";
import type { Session } from "next-auth";
import { requireSession, isAdminRole } from "@/lib/portal/auth-guard";
import { bustLocations, bustReFlags } from "@/lib/portal/revalidate";
import { deleteReFlag, getReFlag, updateReFlag } from "@/lib/portal/re-flags-db";
import {
  FLAG_COLOR_KEYS,
  type ReFlag,
  type ReFlagColor,
} from "@/lib/portal/re-flags-shared";

// Editace/smazání definice flagu je destruktivní pro celý tým (projeví se všem),
// proto smí jen AUTOR flagu nebo admin. Přiřazení flagů k lokalitě (každý
// přihlášený) řeší locations/[id]/flags.

const COLOR_VALUES = FLAG_COLOR_KEYS as [ReFlagColor, ...ReFlagColor[]];

function canManage(session: Session, flag: ReFlag): boolean {
  const email = session.user?.email;
  return flag.createdBy === email || isAdminRole(session.user?.role);
}

const patchSchema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    color: z.enum(COLOR_VALUES).optional(),
  })
  .refine((d) => d.label !== undefined || d.color !== undefined, {
    message: "Nothing to update",
  });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const flag = await getReFlag(id);
  if (!flag) {
    return NextResponse.json({ ok: false, error: "Flag nenalezen" }, { status: 404 });
  }
  if (!canManage(g.session, flag)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed" }, { status: 400 });
  }

  const updated = await updateReFlag(id, parsed.data);
  bustReFlags();

  return NextResponse.json({ ok: true, flag: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const flag = await getReFlag(id);
  if (!flag) {
    return NextResponse.json({ ok: false, error: "Flag nenalezen" }, { status: 404 });
  }
  if (!canManage(g.session, flag)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const touched = await deleteReFlag(id, g.session.user!.email!);
  bustReFlags();
  // Cleanup odebral flag z lokalit → refreshni i tabulku Real Estate.
  if (touched > 0) bustLocations();

  return NextResponse.json({ ok: true, removedFrom: touched });
}
