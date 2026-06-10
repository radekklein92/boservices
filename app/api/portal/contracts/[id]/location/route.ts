import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  statusOrder,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { isApprovalGated } from "@/lib/portal/contract-types";
import { getLocation, toLocationSnapshot } from "@/lib/portal/locations-db";
import { bustContracts } from "@/lib/portal/revalidate";

const bodySchema = z.object({ locationId: z.string().trim().min(1) });

// Nastaví/změní lokalitu smlouvy a nasnapshotuje její aktuální stav z Transition
// (kategorie, nájem, nový režim). Jen typy posuzované podle lokality. Měnit lze
// v Konceptu (před schválením) nebo zpětně u už podepsané/archivované smlouvy
// (doplnění chybějící lokace u starších smluv). Mezikroky schvalování zůstávají
// zamčené - tam by změna snapshotu zmátla approval gate.
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
  const canAssignLocation =
    contract.status === "koncept" ||
    statusOrder(contract.status) >= statusOrder("podepsano-klientem");
  if (!canAssignLocation) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Lokalitu lze měnit v konceptu nebo u podepsané smlouvy. Mezikroky schvalování jsou zamčené.",
      },
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
    locationSnapshot: toLocationSnapshot(location, now),
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
