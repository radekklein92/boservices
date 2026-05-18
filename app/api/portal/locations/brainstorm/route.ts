import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  getLocationsBrainstorm,
  setLocationsBrainstorm,
} from "@/lib/portal/locations-notes-db";

const updateSchema = z.object({
  content: z.string().max(50_000),
});

export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const note = await getLocationsBrainstorm();
  return NextResponse.json({ ok: true, note });
}

export async function PUT(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  await setLocationsBrainstorm({
    content: parsed.data.content,
    updatedBy: g.session.user!.email!,
    updatedAt: nowIso,
  });

  return NextResponse.json({ ok: true, updatedAt: nowIso });
}
