import { NextResponse, after } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustContracts } from "@/lib/portal/revalidate";
import {
  computeContractStatus,
  getContract,
  locationRequiredError,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { ensureContractFeeTerms } from "@/lib/portal/contract-fee-ai";

// AI extrakce poplatků (Claude přes text smlouvy) běží přes `after` až PO odeslání
// odpovědi - podpis se vrátí okamžitě. maxDuration musí pokrýt i tuto práci na pozadí.
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const locErr = locationRequiredError(contract);
  if (locErr) {
    return NextResponse.json({ ok: false, error: locErr }, { status: 409 });
  }

  // Datum, kdy klient skutečně podepsal (zadané v UI; klient mohl podepsat dřív).
  // Slouží jako kotva pro výpočet poplatků (účinnost, konec, periody). Bez zadání
  // (nebo neplatné) = dnes. Ukládáme na poledne UTC, ať se datum neposune přes TZ.
  const body = await req.json().catch(() => null);
  const rawDate =
    body && typeof body.signedAt === "string" ? body.signedAt.trim() : "";
  const now = new Date().toISOString();
  const clientSignedAt = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? `${rawDate}T12:00:00.000Z`
    : now;
  const updated = {
    ...contract,
    clientSignedAt,
    clientSignedBy: g.session.user!.email!,
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);
  bustContracts();

  // Poplatky ze smlouvy (AI) - na pozadí PO odeslání odpovědi (podpis nečeká).
  // Jen approval-gated typy, idempotentní a best-effort; selhání nezablokuje podpis
  // (uloží feeTermsError, cron/tlačítko zkusí znovu).
  after(() => ensureContractFeeTerms(updated));

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

  const {
    clientSignedAt: _cs,
    clientSignedBy: _csb,
    ...rest
  } = contract;
  void _cs; void _csb;
  const updated = {
    ...rest,
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
