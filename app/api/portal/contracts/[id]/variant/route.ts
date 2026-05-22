import { NextResponse } from "next/server";
import { z } from "zod";
import { del } from "@vercel/blob";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { getOrSeedContractTemplate } from "@/lib/portal/contract-templates-db";
import { bustContracts } from "@/lib/portal/revalidate";
import {
  hasVariants,
  isValidVariantForType,
  type ContractVariant,
} from "@/lib/portal/contract-types";

const switchSchema = z.object({
  variant: z.string().trim().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Smlouva nenalezena." }, { status: 404 });
  }
  if (!hasVariants(contract.type)) {
    return NextResponse.json(
      { ok: false, error: "Tento typ smlouvy nemá varianty." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = switchSchema.safeParse(body);
  if (
    !parsed.success ||
    !isValidVariantForType(contract.type, parsed.data.variant)
  ) {
    return NextResponse.json(
      { ok: false, error: "Neplatná varianta." },
      { status: 400 },
    );
  }
  const variant = parsed.data.variant as ContractVariant;

  if (contract.variant === variant) {
    bustContracts();
    return NextResponse.json({ ok: true, contract });
  }

  const template = await getOrSeedContractTemplate(contract.type, variant);

  // Best-effort cleanup of generated PDF blob (přegenerování bude nutné)
  if (contract.generatedPdfPath && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(contract.generatedPdfPath);
    } catch (err) {
      console.error("[contracts] blob delete on variant switch failed", err);
    }
  }

  const now = new Date().toISOString();
  // Franšízový poplatek: B = pevně 8 %, AB = ponechat stávající, případně default 8.
  const nextVariables = { ...contract.variables };
  if (contract.type === "franchise") {
    if (variant === "B") {
      nextVariables.franchiseFeePercent = "8";
    } else if (!nextVariables.franchiseFeePercent) {
      nextVariables.franchiseFeePercent = "8";
    }
  }
  const updated = {
    ...contract,
    variant,
    html: template.html,
    templateSnapshot: template.html,
    variables: nextVariables,
    generatedPdfUrl: undefined,
    generatedPdfPath: undefined,
    generatedAt: undefined,
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);

  await upsertContract(updated);
  bustContracts();
  return NextResponse.json({ ok: true, contract: updated });
}
