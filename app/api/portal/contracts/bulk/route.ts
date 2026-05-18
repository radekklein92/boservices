import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["signed", "picked-up"]),
});

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Neplatný vstup." },
      { status: 400 },
    );
  }

  const { ids, action } = parsed.data;
  const email = g.session.user!.email!;
  const nowIso = new Date().toISOString();

  let changed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of ids) {
    const contract = await getContract(id);
    if (!contract) {
      errors.push(`${id}: nenalezeno`);
      continue;
    }

    // Status flow je lineární. Pro "signed" stačí, aby byla aspoň generovaná
    // (jinak nic neoznačujeme — koncept se ručně musí přes generování pustit).
    if (action === "signed") {
      if (!contract.generatedAt) {
        skipped++;
        continue;
      }
      if (contract.signedAt) {
        skipped++;
        continue;
      }
      const updated = {
        ...contract,
        signedAt: nowIso,
        signedBy: email,
        updatedAt: nowIso,
      };
      updated.status = computeContractStatus(updated);
      await upsertContract(updated);
      changed++;
      continue;
    }

    // "picked-up": vyžaduje signed. Pokud chybí, doplníme oba milestony,
    // protože v praxi user vyzvedne smlouvu už podepsanou jednateli.
    if (action === "picked-up") {
      if (!contract.generatedAt) {
        skipped++;
        continue;
      }
      if (contract.pickedUpAt) {
        skipped++;
        continue;
      }
      const updated = {
        ...contract,
        signedAt: contract.signedAt ?? nowIso,
        signedBy: contract.signedBy ?? email,
        pickedUpAt: nowIso,
        pickedUpBy: email,
        updatedAt: nowIso,
      };
      updated.status = computeContractStatus(updated);
      await upsertContract(updated);
      changed++;
      continue;
    }
  }

  return NextResponse.json({ ok: true, changed, skipped, errors });
}
