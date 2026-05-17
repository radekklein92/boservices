import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { isContractType } from "@/lib/portal/contract-types";
import {
  getOrSeedContractTemplate,
  upsertContractTemplate,
} from "@/lib/portal/contract-templates-db";

const updateSchema = z.object({
  html: z.string().max(200_000),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;
  if (!isContractType(type)) {
    return NextResponse.json({ ok: false, error: "Unknown type" }, { status: 404 });
  }
  const template = await getOrSeedContractTemplate(type);
  return NextResponse.json({ ok: true, template });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { type } = await params;
  if (!isContractType(type)) {
    return NextResponse.json({ ok: false, error: "Unknown type" }, { status: 404 });
  }

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

  const existing = await getOrSeedContractTemplate(type);
  await upsertContractTemplate({
    ...existing,
    html: parsed.data.html,
    updatedBy: g.session.user!.email!,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
