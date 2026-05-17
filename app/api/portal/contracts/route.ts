import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireSession } from "@/lib/portal/auth-guard";
import { getClient } from "@/lib/portal/clients-db";
import { isContractType, CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
import { getOrSeedContractTemplate } from "@/lib/portal/contract-templates-db";
import { listContracts, upsertContract } from "@/lib/portal/contracts-db";
import {
  buildClientVariables,
  buildDefaultContractMeta,
  PROVIDER_DEFAULTS,
} from "@/lib/portal/contract-render";

const createSchema = z.object({
  clientId: z.string().trim().min(1),
  type: z.string().trim().min(1),
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
  const { clientId, type } = parsed.data;

  const client = await getClient(clientId);
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Klient nenalezen." },
      { status: 404 },
    );
  }

  const template = await getOrSeedContractTemplate(type);
  const variables = {
    ...buildDefaultContractMeta(),
    ...PROVIDER_DEFAULTS,
    ...buildClientVariables(client),
  };

  const now = new Date().toISOString();
  const id = nanoid(12);

  await upsertContract({
    id,
    type,
    clientId: client.id,
    clientName: client.companyName,
    status: "draft",
    html: template.html,
    variables,
    createdBy: g.session.user!.email!,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({
    ok: true,
    id,
    typeName: CONTRACT_TYPE_META[type].fullName,
  });
}
