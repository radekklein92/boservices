import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
  type Contract,
} from "@/lib/portal/contracts-db";
import { cancelEnvelope } from "@/lib/portal/digisign";
import { bustContracts } from "@/lib/portal/revalidate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Zrušení odeslání k podpisu: stornuje obálku v DigiSign a vrátí smlouvu zpět do
// stavu „K podpisu" (smaže digisign* milestone pole + případný elektronický
// mezistav-podpis BOS; status se dopočítá přes computeContractStatus). Protože
// signerPickedAt zůstává, znovu se nabídne ruční i DigiSign cesta.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Smlouva nenalezena." }, { status: 404 });
  }
  if (contract.digisignStatus !== "sent") {
    return NextResponse.json(
      { ok: false, error: "Zrušit lze jen smlouvu odeslanou k podpisu." },
      { status: 409 },
    );
  }

  // Storno obálky best-effort - obálka už může být v terminálním stavu, to nesmí
  // zablokovat návrat do „K podpisu".
  if (contract.digisignEnvelopeId) {
    try {
      await cancelEnvelope(contract.digisignEnvelopeId, "Zrušeno odesílatelem");
    } catch (err) {
      console.warn("[digisign-cancel] storno obálky selhalo:", err);
    }
  }

  const now = new Date().toISOString();
  const updated: Contract = {
    ...contract,
    digisignEnvelopeId: undefined,
    digisignDocumentId: undefined,
    digisignStatus: undefined,
    digisignSentAt: undefined,
    digisignSentBy: undefined,
    digisignClientSignedAt: undefined,
    updatedAt: now,
  };
  // Elektronický mezistav-podpis BOS (signedBy "DigiSign") se zrušením anuluje,
  // ať se status vrátí čistě na „K podpisu" (ruční podpis BOS by „DigiSign" neměl).
  if (updated.signedBy === "DigiSign") {
    updated.signedAt = undefined;
    updated.signedBy = undefined;
  }
  updated.status = computeContractStatus(updated); // → k-podpisu (signerPickedAt zůstává)
  await upsertContract(updated);
  bustContracts();
  return NextResponse.json({ ok: true, contract: updated });
}
