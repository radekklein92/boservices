import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { lookupAres } from "@/lib/portal/ares";

const schema = z.object({
  ico: z.string().trim().min(1).max(20),
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "IČO musí být číslo." }, { status: 400 });
  }

  const result = await lookupAres(parsed.data.ico);
  if (!result) {
    return NextResponse.json(
      { ok: false, error: "Firma s tímto IČO se v ARES nenašla." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, result });
}
