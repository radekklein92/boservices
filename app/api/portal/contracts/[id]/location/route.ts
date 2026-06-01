import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { isApprovalGated } from "@/lib/portal/contract-types";
import { getLocation } from "@/lib/portal/locations-db";
import { bustContracts } from "@/lib/portal/revalidate";

const bodySchema = z.object({ locationId: z.string().trim().min(1) });

// Nastaví/změní lokalitu smlouvy a nasnapshotuje její aktuální stav z Transition
// (kategorie, nájem, nový režim). Jen typy posuzované podle lokality a jen ve
// stavu Koncept - po odeslání ke schválení je lokalita zamčená.
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
  if (!isApprovalGated(contract.type)) {
    return NextResponse.json(
      { ok: false, error: "Tento typ smlouvy lokalitu nevyžaduje." },
      { status: 400 },
    );
  }
  if (contract.status !== "koncept") {
    return NextResponse.json(
      { ok: false, error: "Lokalitu lze měnit jen v konceptu. Vraťte smlouvu do konceptu." },
      { status: 409 },
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
    return NextResponse.json({ ok: false, error: "Vyberte lokalitu." }, { status: 400 });
  }

  const location = await getLocation(parsed.data.locationId);
  if (!location) {
    return NextResponse.json(
      { ok: false, error: "Lokalita nenalezena." },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const updated = {
    ...contract,
    locationId: location.id,
    locationSnapshot: {
      name: location.name,
      category: location.category,
      leaseStatus: location.lease_current_status,
      newMode: location.new_mode,
      capturedAt: now,
    },
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
