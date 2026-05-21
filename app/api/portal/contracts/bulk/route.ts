import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { getUser } from "@/lib/portal/users-db";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["approve", "pick-signer", "signed", "client-signed"]),
  // Vyžadováno jen pro action=pick-signer.
  signerEmail: z.string().trim().toLowerCase().email().optional(),
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

  const { ids, action, signerEmail } = parsed.data;
  const email = g.session.user!.email!;
  const nowIso = new Date().toISOString();

  // Pro pick-signer si načteme usera předem (jeden lookup pro všech N smluv).
  let signer: Awaited<ReturnType<typeof getUser>> = null;
  if (action === "pick-signer") {
    if (!signerEmail) {
      return NextResponse.json(
        { ok: false, error: "Chybí email podepisujícího." },
        { status: 400 },
      );
    }
    signer = await getUser(signerEmail);
    if (!signer || !signer.isSigner || !signer.signerFunction) {
      return NextResponse.json(
        { ok: false, error: "Vybraný uživatel není podepisující." },
        { status: 400 },
      );
    }
  }

  let changed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of ids) {
    const contract = await getContract(id);
    if (!contract) {
      errors.push(`${id}: nenalezeno`);
      continue;
    }

    if (action === "approve") {
      if (contract.approvedAt) {
        skipped++;
        continue;
      }
      const updated = {
        ...contract,
        approvedAt: nowIso,
        approvedBy: email,
        updatedAt: nowIso,
      };
      updated.status = computeContractStatus(updated);
      await upsertContract(updated);
      changed++;
      continue;
    }

    if (action === "pick-signer") {
      // Vyžaduje, aby byla smlouva už schválená. Pokud není, automaticky
      // doplníme approvedAt (admin v jednom kroku schvaluje + pickuje).
      const updated = {
        ...contract,
        approvedAt: contract.approvedAt ?? nowIso,
        approvedBy: contract.approvedBy ?? email,
        signerEmail: signer!.email,
        signerPickedAt: contract.signerPickedAt ?? nowIso,
        signerPickedBy: email,
        updatedAt: nowIso,
      };
      updated.status = computeContractStatus(updated);
      await upsertContract(updated);
      changed++;
      continue;
    }

    if (action === "signed") {
      if (contract.signedAt) {
        skipped++;
        continue;
      }
      // Doplníme i předchozí milestones, pokud chybí.
      const updated = {
        ...contract,
        approvedAt: contract.approvedAt ?? nowIso,
        approvedBy: contract.approvedBy ?? email,
        signerPickedAt: contract.signerPickedAt ?? nowIso,
        signerPickedBy: contract.signerPickedBy ?? email,
        signedAt: nowIso,
        signedBy: email,
        updatedAt: nowIso,
      };
      updated.status = computeContractStatus(updated);
      await upsertContract(updated);
      changed++;
      continue;
    }

    if (action === "client-signed") {
      if (contract.clientSignedAt) {
        skipped++;
        continue;
      }
      const updated = {
        ...contract,
        approvedAt: contract.approvedAt ?? nowIso,
        approvedBy: contract.approvedBy ?? email,
        signerPickedAt: contract.signerPickedAt ?? nowIso,
        signerPickedBy: contract.signerPickedBy ?? email,
        signedAt: contract.signedAt ?? nowIso,
        signedBy: contract.signedBy ?? email,
        clientSignedAt: nowIso,
        clientSignedBy: email,
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
