import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { listContractTemplates } from "@/lib/portal/contract-templates-db";

export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const items = await listContractTemplates();
  return NextResponse.json({ ok: true, items });
}
