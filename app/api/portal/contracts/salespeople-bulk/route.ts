import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { getContract, upsertContract } from "@/lib/portal/contracts-db";
import { normalizeSalespeople } from "@/lib/portal/commissions";
import { bustContracts } from "@/lib/portal/revalidate";

const bodySchema = z.object({
  ids: z.array(z.string().max(100)).min(1).max(1000),
  // Prázdné pole = hromadné odebrání. Max 2 (Toman/Ebermann).
  salespeople: z.array(z.enum(["toman", "ebermann"])).max(2),
});

// Hromadné přiřazení obchodníků k více smlouvám najednou (admin-only). Jeden
// request + jedna invalidace cache místo N round-tripů. Stejně jako u single
// endpointu ZÁMĚRNĚ bez isContractEditable gate (i podepsané smlouvy) a jen
// franšíza / claim-bundle (ostatní typy se přeskočí).
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

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
  const now = new Date().toISOString();

  const results = await Promise.all(
    parsed.data.ids.map(async (id) => {
      const c = await getContract(id);
      if (!c) return "missing" as const;
      if (c.type !== "franchise" && c.type !== "claim-bundle") {
        return "skipped" as const;
      }
      await upsertContract({ ...c, salespeople, updatedAt: now });
      return "updated" as const;
    }),
  );

  const updated = results.filter((r) => r === "updated").length;
  bustContracts();
  return NextResponse.json({ ok: true, updated, salespeople });
}
