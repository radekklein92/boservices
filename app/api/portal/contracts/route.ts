import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireSession } from "@/lib/portal/auth-guard";
import { getClient } from "@/lib/portal/clients-db";
import {
  isContractType,
  isFranchiseVariant,
  hasVariants,
  CONTRACT_TYPE_META,
  DEFAULT_FRANCHISE_VARIANT,
  type FranchiseVariant,
} from "@/lib/portal/contract-types";
import { getOrSeedContractTemplate } from "@/lib/portal/contract-templates-db";
import {
  getNextContractNumber,
  listContracts,
  upsertContract,
} from "@/lib/portal/contracts-db";
import {
  buildClientVariables,
  buildDefaultContractMeta,
  PROVIDER_DEFAULTS,
} from "@/lib/portal/contract-render";

const createSchema = z.object({
  clientId: z.string().trim().min(1),
  type: z.string().trim().min(1),
  variant: z.string().trim().optional(),
  franchiseFeePercent: z.number().int().min(0).max(8).optional(),
});

export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const contracts = await listContracts();
  return NextResponse.json({ ok: true, contracts });
}

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
  if (!parsed.success || !isContractType(parsed.data.type)) {
    return NextResponse.json(
      { ok: false, error: "Vyberte klienta a typ smlouvy." },
      { status: 400 },
    );
  }
  const {
    clientId,
    type,
    variant: rawVariant,
    franchiseFeePercent: rawFeePercent,
  } = parsed.data;

  const client = await getClient(clientId);
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Klient nenalezen." },
      { status: 404 },
    );
  }

  let variant: FranchiseVariant | undefined;
  if (hasVariants(type)) {
    if (rawVariant && isFranchiseVariant(rawVariant)) {
      variant = rawVariant;
    } else {
      variant = DEFAULT_FRANCHISE_VARIANT;
    }
  }

  const template = await getOrSeedContractTemplate(type, variant);
  const now = new Date();
  const meta = buildDefaultContractMeta(now);
  const number = await getNextContractNumber(now);
  const variables: Record<string, string> = {
    ...meta,
    ...PROVIDER_DEFAULTS,
    ...buildClientVariables(client),
    contractNumber: number,
    effectiveDate: meta.contractDate ?? "",
  };

  // Franšízový a marketingový poplatek - placeholder {{franchiseFeePercent}}.
  // Varianta B = pevně 8 %, varianta AB = volba 0-8 (default 8) z modálu.
  if (type === "franchise") {
    const feePercent = variant === "B" ? 8 : (rawFeePercent ?? 8);
    variables.franchiseFeePercent = String(feePercent);
  }

  const nowIso = now.toISOString();
  const id = nanoid(12);

  await upsertContract({
    id,
    type,
    clientId: client.id,
    clientName: client.companyName,
    status: "draft",
    html: template.html,
    templateSnapshot: template.html,
    variant,
    variables,
    number,
    createdBy: g.session.user!.email!,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  return NextResponse.json({
    ok: true,
    id,
    typeName: CONTRACT_TYPE_META[type].fullName,
  });
}
