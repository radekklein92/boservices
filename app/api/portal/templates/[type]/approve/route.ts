import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { getUser } from "@/lib/portal/users-db";
import { bustTemplates } from "@/lib/portal/revalidate";
import {
  getDefaultVariantForType,
  hasVariants,
  isContractType,
  isValidVariantForType,
  type ContractVariant,
} from "@/lib/portal/contract-types";
import {
  getOrSeedContractTemplate,
  upsertContractTemplate,
} from "@/lib/portal/contract-templates-db";

// Schválení šablony. Jen uživatel s isTemplateApprover=true.
// Nastaví approvedAt = now, approvedBy = email. updatedAt neměníme -
// jinak by se vlastní schválení projevilo jako "změna" pro auto-invalidaci.

function resolveVariant(
  type: string,
  url: URL,
): ContractVariant | undefined {
  if (!isContractType(type) || !hasVariants(type)) return undefined;
  const raw = url.searchParams.get("variant");
  if (raw && isValidVariantForType(type, raw)) return raw as ContractVariant;
  return getDefaultVariantForType(type) as ContractVariant | undefined;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const me = await getUser(g.session.user!.email!);
  if (!me?.isTemplateApprover) {
    return NextResponse.json(
      { ok: false, error: "Šablony může schvalovat pouze určený schvalovatel." },
      { status: 403 },
    );
  }

  const { type } = await params;
  if (!isContractType(type)) {
    return NextResponse.json({ ok: false, error: "Unknown type" }, { status: 404 });
  }

  const url = new URL(req.url);
  const variant = resolveVariant(type, url);
  const existing = await getOrSeedContractTemplate(type, variant);
  const now = new Date().toISOString();
  await upsertContractTemplate({
    ...existing,
    variant,
    approvedAt: now,
    approvedBy: me.email,
  });

  bustTemplates();
  return NextResponse.json({ ok: true });
}
