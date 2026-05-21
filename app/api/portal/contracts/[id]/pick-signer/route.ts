import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { getUser } from "@/lib/portal/users-db";

const pickSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = pickSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Chybí email podepisujícího." },
      { status: 400 },
    );
  }

  const signer = await getUser(parsed.data.email);
  if (!signer) {
    return NextResponse.json(
      { ok: false, error: "Podepisující nenalezen." },
      { status: 404 },
    );
  }
  if (!signer.isSigner || !signer.signerFunction) {
    return NextResponse.json(
      { ok: false, error: "Vybraný uživatel není podepisující." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Vyžadujeme aspoň Schváleno - dál nelze přeskakovat.
  if (!contract.approvedAt) {
    return NextResponse.json(
      { ok: false, error: "Smlouva musí být nejdřív schválená." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const updated = {
    ...contract,
    signerEmail: signer.email,
    signerPickedAt: contract.signerPickedAt ?? now,
    signerPickedBy: g.session.user!.email!,
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
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

  // Rollback K podpisu: navíc smaže i Podepsáno BOS/klientem dál.
  const {
    signerEmail: _se,
    signerPickedAt: _sp,
    signerPickedBy: _spb,
    signedAt: _sa,
    signedBy: _sb,
    clientSignedAt: _cs,
    clientSignedBy: _csb,
    ...rest
  } = contract;
  void _se; void _sp; void _spb;
  void _sa; void _sb; void _cs; void _csb;
  const updated = {
    ...rest,
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  return NextResponse.json({ ok: true });
}
