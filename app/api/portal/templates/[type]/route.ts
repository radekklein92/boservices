import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import {
  getDefaultVariantForType,
  hasVariants,
  isContractType,
  isValidVariantForType,
  type ContractVariant,
} from "@/lib/portal/contract-types";
import {
  deleteContractTemplate,
  getOrSeedContractTemplate,
  upsertContractTemplate,
} from "@/lib/portal/contract-templates-db";

const updateSchema = z.object({
  html: z.string().max(200_000),
});

function resolveVariant(
  type: string,
  url: URL,
): ContractVariant | undefined {
  if (!isContractType(type) || !hasVariants(type)) return undefined;
  const raw = url.searchParams.get("variant");
  if (raw && isValidVariantForType(type, raw)) return raw as ContractVariant;
  return getDefaultVariantForType(type) as ContractVariant | undefined;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;
  if (!isContractType(type)) {
    return NextResponse.json({ ok: false, error: "Unknown type" }, { status: 404 });
  }
  const url = new URL(req.url);
  const variant = resolveVariant(type, url);
  const template = await getOrSeedContractTemplate(type, variant);
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

  const url = new URL(req.url);
  const variant = resolveVariant(type, url);
  const existing = await getOrSeedContractTemplate(type, variant);
  await upsertContractTemplate({
    ...existing,
    variant,
    html: parsed.data.html,
    updatedBy: g.session.user!.email!,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}

// Reset šablony na výchozí (smaže Redis záznam, příští GET vrátí čistý default).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { type } = await params;
  if (!isContractType(type)) {
    return NextResponse.json({ ok: false, error: "Unknown type" }, { status: 404 });
  }

  const url = new URL(req.url);
  const variant = resolveVariant(type, url);
  await deleteContractTemplate(type, variant);

  return NextResponse.json({ ok: true });
}
