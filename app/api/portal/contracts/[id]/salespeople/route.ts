import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { getContract, upsertContract } from "@/lib/portal/contracts-db";
import { normalizeSalespeople } from "@/lib/portal/commissions";
import { bustContracts } from "@/lib/portal/revalidate";

const bodySchema = z.object({
  // Prázdné pole = odebrání přiřazení. Max 2 (Toman/Ebermann).
  salespeople: z.array(z.enum(["toman", "ebermann"])).max(2),
});

// Přiřadí obchodníky (provize) ke smlouvě. Jen franšíza a postoupení pohledávek.
// ZÁMĚRNĚ bez isContractEditable gate - přiřazení je provizní metadata, musí jít
// doplnit i u už podepsaných / archivovaných smluv (jednorázový backfill).
// Admin-only (skutečná hranice; UI to jen skrývá).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (contract.type !== "franchise" && contract.type !== "claim-bundle") {
    return NextResponse.json(
      {
        ok: false,
        error: "Obchodníka lze přiřadit jen u franšízy a postoupení pohledávek.",
      },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Neplatný vstup." }, { status: 400 });
  }

  const salespeople = normalizeSalespeople(parsed.data.salespeople);
  const updated = {
    ...contract,
    salespeople,
    updatedAt: new Date().toISOString(),
  };
  // Žádný computeContractStatus - přiřazení obchodníka není milestone.
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true, salespeople });
}
