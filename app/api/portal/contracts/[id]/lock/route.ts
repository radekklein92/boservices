import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  canManageContractLock,
  getContract,
  isContractEditable,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { bustContracts } from "@/lib/portal/revalidate";

const lockSchema = z.object({
  lock: z.boolean(),
  allowed: z.array(z.string().trim().email().max(200)).max(50).default([]),
});

// Nastaví/zruší uživatelský zámek úprav konceptu. Zamknout smí ten, kdo zrovna
// smí editovat (a koncept ještě není status-uzamčený). Změnit/odemknout smí jen
// ten, kdo zamkl, nebo superadmin.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const existing = await getContract(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (!isContractEditable(existing.status)) {
    return NextResponse.json(
      { ok: false, error: "Smlouvu v tomto stavu už nelze zamykat ani upravovat." },
      { status: 409 },
    );
  }

  const parsed = lockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Neplatný vstup." }, { status: 400 });
  }

  const email = g.session.user!.email!.toLowerCase();
  const role = g.session.user!.role;
  const isSuperadmin = role === "superadmin";

  // Cizí zámek smí přenastavit jen jeho autor nebo superadmin.
  if (!canManageContractLock(existing.editLock, email, isSuperadmin)) {
    return NextResponse.json(
      { ok: false, error: "Zámek může spravovat jen ten, kdo ho nastavil." },
      { status: 403 },
    );
  }

  const allowed = Array.from(
    new Set(parsed.data.allowed.map((e) => e.toLowerCase()).filter((e) => e !== email)),
  );

  const updated = {
    ...existing,
    editLock: parsed.data.lock
      ? {
          by: email,
          byName: g.session.user!.name ?? undefined,
          allowed,
          at: new Date().toISOString(),
        }
      : undefined,
    updatedAt: new Date().toISOString(),
  };
  await upsertContract(updated);
  bustContracts();
  return NextResponse.json({ ok: true, contract: updated });
}
