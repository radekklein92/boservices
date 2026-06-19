import { NextResponse } from "next/server";
import { isAdminRole, requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { bustContracts } from "@/lib/portal/revalidate";

// Zrušení smlouvy (klient odstoupil) - terminální override statusu na „zrusena".
// Jen admin: akce nuluje provize a snižuje čísla na dashboardu. POST nastaví
// cancelledAt, DELETE ho vymaže (status se vrátí dle timestampů).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  if (!isAdminRole(g.session.user?.role)) {
    return NextResponse.json(
      { ok: false, error: "Zrušit smlouvu může pouze administrátor." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let reason: string | undefined;
  try {
    const body = (await req.json()) as { reason?: unknown };
    if (typeof body?.reason === "string" && body.reason.trim()) {
      reason = body.reason.trim().slice(0, 500);
    }
  } catch {
    // bez těla - důvod prostě není
  }

  const now = new Date().toISOString();
  const updated = {
    ...contract,
    cancelledAt: now,
    cancelledBy: g.session.user!.email!,
    ...(g.session.user?.name?.trim()
      ? { cancelledByName: g.session.user.name.trim() }
      : {}),
    ...(reason ? { cancelReason: reason } : {}),
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  if (!isAdminRole(g.session.user?.role)) {
    return NextResponse.json(
      { ok: false, error: "Obnovit smlouvu může pouze administrátor." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const {
    cancelledAt: _ca,
    cancelledBy: _cb,
    cancelledByName: _cbn,
    cancelReason: _cr,
    ...rest
  } = contract;
  void _ca;
  void _cb;
  void _cbn;
  void _cr;
  const updated = {
    ...rest,
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
