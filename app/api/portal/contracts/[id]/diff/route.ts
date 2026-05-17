import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { getContract } from "@/lib/portal/contracts-db";
import { getOrSeedContractTemplate } from "@/lib/portal/contract-templates-db";
import { htmlDiff } from "@/lib/portal/contract-diff";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Pro starší smlouvy bez snapshotu použijeme aktuální šablonu jako
  // fallback (lepší než nic - aspoň ukáže rozdíl proti aktuálnímu znění).
  let snapshot = contract.templateSnapshot;
  if (!snapshot) {
    const template = await getOrSeedContractTemplate(contract.type);
    snapshot = template.html;
  }

  const result = htmlDiff(snapshot, contract.html);
  return NextResponse.json({
    ok: true,
    hasChanges: result.hasChanges,
    changeCount: result.changeCount,
    diffHtml: result.diffHtml,
    snapshotHtml: snapshot,
    currentHtml: contract.html,
  });
}
