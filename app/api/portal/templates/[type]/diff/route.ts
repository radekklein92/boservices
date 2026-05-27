import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  getDefaultVariantForType,
  hasVariants,
  isContractType,
  isValidVariantForType,
  type ContractVariant,
} from "@/lib/portal/contract-types";
import { getOrSeedContractTemplate } from "@/lib/portal/contract-templates-db";
import { buildDefaultHtml } from "@/lib/portal/default-templates";
import { htmlDiff } from "@/lib/portal/contract-diff";

// Diff šablony: porovná naposledy schválenou verzi (approvedHtml) s aktuálním
// HTML a vrátí track-changes HTML (<ins>/<del>). Když schválený snapshot chybí
// (starší šablony), použije výchozí šablonu jako baseline a označí comparedToDefault.

function resolveVariant(type: string, url: URL): ContractVariant | undefined {
  if (!isContractType(type) || !hasVariants(type)) return undefined;
  const raw = url.searchParams.get("variant");
  if (raw && isValidVariantForType(type, raw)) return raw as ContractVariant;
  return getDefaultVariantForType(type) as ContractVariant | undefined;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { type } = await params;
  if (!isContractType(type)) {
    return NextResponse.json({ ok: false, error: "Unknown type" }, { status: 404 });
  }

  const url = new URL(req.url);
  const variant = resolveVariant(type, url);
  const template = await getOrSeedContractTemplate(type, variant);

  const comparedToDefault = !template.approvedHtml;
  const baseline = template.approvedHtml ?? buildDefaultHtml(type, variant);
  const result = htmlDiff(baseline, template.html);

  return NextResponse.json({
    ok: true,
    hasChanges: result.hasChanges,
    changeCount: result.changeCount,
    diffHtml: result.diffHtml,
    comparedToDefault,
  });
}
