import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  getContract,
  setEnvelopeContractId,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { getUser } from "@/lib/portal/users-db";
import { renderContractPdfBuffer } from "@/lib/portal/pdf-flow";
import { sendForSigning, type DigiSignSigner } from "@/lib/portal/digisign";
import { bustContracts } from "@/lib/portal/revalidate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Odeslání NDA k elektronickému podpisu přes DigiSign. Obálka má dva podepisující:
// Poskytující stranu (BOServices = vybraný uživatel-podepisující s telefonem) a
// Přijímající stranu (protistrana = klient). Po dokončení doplní webhook podpisy.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Smlouva nenalezena." }, { status: 404 });
  }
  if (contract.type !== "nda") {
    return NextResponse.json(
      { ok: false, error: "Odeslání přes DigiSign je zatím jen pro NDA." },
      { status: 400 },
    );
  }
  if (contract.digisignStatus === "sent" || contract.digisignStatus === "signed") {
    return NextResponse.json(
      { ok: false, error: "Smlouva už byla odeslána k podpisu." },
      { status: 409 },
    );
  }
  // Vyžadujeme krok „K podpisu" - vybraný podepisující za BOS + finální PDF.
  if (!contract.signerPickedAt || !contract.signerEmail) {
    return NextResponse.json(
      { ok: false, error: "Nejdřív vyberte podepisujícího za BOServices (krok K podpisu)." },
      { status: 409 },
    );
  }

  const signer = await getUser(contract.signerEmail);
  if (!signer) {
    return NextResponse.json({ ok: false, error: "Podepisující nenalezen." }, { status: 404 });
  }
  if (!signer.phone || !signer.phone.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: `Podepisující ${signer.name} nemá v profilu telefon, který DigiSign vyžaduje.`,
      },
      { status: 400 },
    );
  }

  const v = contract.variables ?? {};
  const clientEmail = (v.clientEmail ?? "").trim();
  const clientPhone = (v.clientPhone ?? "").trim();
  if (!clientEmail || !clientPhone) {
    return NextResponse.json(
      {
        ok: false,
        error: "Protistrana nemá v kartě klienta vyplněný e-mail i telefon (DigiSign je vyžaduje).",
      },
      { status: 400 },
    );
  }

  const signers: DigiSignSigner[] = [
    {
      name: signer.signerDisplayName?.trim() || signer.name,
      email: signer.email,
      phone: signer.phone,
    },
    {
      name: (v.clientSignerName || v.clientName || contract.clientName).trim(),
      email: clientEmail,
      phone: clientPhone,
    },
  ];

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderContractPdfBuffer(contract);
  } catch (err) {
    console.error("[digisign-send] render PDF failed", err);
    return NextResponse.json({ ok: false, error: "Generování PDF selhalo." }, { status: 500 });
  }

  const fileName = `nda-${(contract.number ?? contract.id).replace(/\//g, "-")}.pdf`;
  const envelopeName = `Dohoda o mlčenlivosti - ${contract.clientName}`;

  let result;
  try {
    result = await sendForSigning({
      pdfBuffer,
      fileName,
      envelopeName,
      emailSubject: `Dohoda o mlčenlivosti k podpisu - ${contract.clientName}`,
      emailBody:
        `<p>Dobrý den,</p><p>k elektronickému podpisu Vám byla zaslána <strong>Dohoda o mlčenlivosti</strong> ` +
        `se společností Business Operations Services s.r.o. Dokument prosím podepište kliknutím na tlačítko níže.</p>`,
      emailBodyCompleted:
        `<p>Děkujeme. Dohoda o mlčenlivosti byla úspěšně podepsána všemi stranami.</p>`,
      signers,
    });
  } catch (err) {
    console.error("[digisign-send] DigiSign failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Odeslání do DigiSign selhalo." },
      { status: 502 },
    );
  }

  const updated = {
    ...contract,
    digisignEnvelopeId: result.envelopeId,
    digisignDocumentId: result.documentId,
    digisignStatus: "sent" as const,
    digisignSentAt: new Date().toISOString(),
    digisignSentBy: g.session.user?.email ?? undefined,
    updatedAt: new Date().toISOString(),
  };
  await upsertContract(updated);
  await setEnvelopeContractId(result.envelopeId, contract.id);
  bustContracts();

  return NextResponse.json({ ok: true, contract: updated });
}
