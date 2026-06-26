import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustReFlags } from "@/lib/portal/revalidate";
import { createReFlag, listReFlags } from "@/lib/portal/re-flags-db";
import { FLAG_COLOR_KEYS, type ReFlagColor } from "@/lib/portal/re-flags-shared";

// Katalog uživatelských flagů (sdílený napříč týmem). Vytvořit smí každý
// přihlášený uživatel; editace/mazání (autor/admin) je v [id]/route.ts.

const COLOR_VALUES = FLAG_COLOR_KEYS as [ReFlagColor, ...ReFlagColor[]];

export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const flags = await listReFlags();
  return NextResponse.json({ ok: true, flags });
}

const createSchema = z.object({
  label: z.string().trim().min(1).max(60),
  color: z.enum(COLOR_VALUES),
});

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed" }, { status: 400 });
  }

  const flag = await createReFlag(parsed.data, g.session.user!.email!);
  bustReFlags();

  return NextResponse.json({ ok: true, flag });
}
