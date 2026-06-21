import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  getContract,
  setEnvelopeContractId,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { CONTRACT_TYPE_META, isDigisignType } from "@/lib/portal/contract-types";
import { getClientSignedNda } from "@/lib/portal/client-nda";
import { getUser } from "@/lib/portal/users-db";
import { renderContractPdfBuffer } from "@/lib/portal/pdf-flow";
import {
  cancelEnvelope,
  sendForSigning,
  type DigiSignSigner,
} from "@/lib/portal/digisign";
import { bustContracts } from "@/lib/portal/revalidate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Odeslání smlouvy k elektronickému podpisu přes DigiSign. Podporované typy: NDA
// a - jako alternativa k ručnímu podpisu - franchise/cooperation/operation.
// Obálka má dva podepisující: Poskytující stranu (BOServices = vybraný uživatel-
// podepisující s telefonem) a Přijímající stranu (protistrana = klient). U ne-NDA
// typů je TVRDÁ podmínka: klient musí mít uzavřenou NDA. Po dokončení doplní
// webhook podpisy.
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
  if (!isDigisignType(contract.type)) {
    return NextResponse.json(
      { ok: false, error: "Tento typ smlouvy nelze podepsat přes DigiSign." },
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

  // Tvrdá NDA podmínka pro ne-NDA typy: klient musí mít uzavřenou (podepsanou)
  // NDA. Server-side pojistka i kdyby UI checkbox/disabled obešli přímým voláním.
  if (contract.type !== "nda") {
    const nda = await getClientSignedNda(contract.clientId);
    if (!nda) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Klient nemá uzavřenou (podepsanou) NDA. Bez ní nelze odeslat smlouvu k elektronickému podpisu.",
        },
        { status: 409 },
      );
    }
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

  // Kotvy (anchor) odpovídají skrytým markerům v podpisovém bloku šablony
  // (wrapSignatureUnits), ať podpisové pole sedne přesně nad jméno. Bez kotev
  // (ručně upravená šablona) DigiSign použije vypočtené pozice na poslední straně.
  const signers: DigiSignSigner[] = [
    {
      name: signer.signerDisplayName?.trim() || signer.name,
      email: signer.email,
      phone: signer.phone,
      placeholder: "signBosFld",
    },
    {
      name: (v.clientSignerName || v.clientName || contract.clientName).trim(),
      email: clientEmail,
      phone: clientPhone,
      placeholder: "signClientFld",
    },
  ];

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderContractPdfBuffer(contract);
  } catch (err) {
    console.error("[digisign-send] render PDF failed", err);
    return NextResponse.json({ ok: false, error: "Generování PDF selhalo." }, { status: 500 });
  }

  // Opakované odeslání po odmítnutí/zrušení: zkusit zrušit starou obálku
  // (best-effort, neblokuje nové odeslání).
  if (
    (contract.digisignStatus === "declined" ||
      contract.digisignStatus === "voided") &&
    contract.digisignEnvelopeId
  ) {
    try {
      await cancelEnvelope(contract.digisignEnvelopeId, "Opakované odeslání k podpisu");
    } catch (err) {
      console.warn("[digisign-send] storno staré obálky selhalo:", err);
    }
  }

  const meta = CONTRACT_TYPE_META[contract.type];
  const docLabel = meta.fullName;
  const numberSuffix = (contract.number ?? contract.id).replace(/\//g, "-");
  const numberTag = contract.number ? ` (${contract.number})` : "";
  const fileName = `${contract.type}-${numberSuffix}.pdf`;
  // Unikátní předmět (typ + číslo), ať e-mailový klient nesdružuje vlákna.
  const envelopeName = `${docLabel} - ${contract.clientName}${numberTag}`;

  let result;
  try {
    result = await sendForSigning({
      pdfBuffer,
      fileName,
      envelopeName,
      emailSubject: `${docLabel} k podpisu - ${contract.clientName}${numberTag}`,
      emailBody:
        `<p>Dobrý den,</p><p>k elektronickému podpisu Vám byla zaslána smlouva <strong>${docLabel}</strong> ` +
        `se společností Business Operations Services s.r.o. Dokument prosím podepište kliknutím na tlačítko níže.</p>`,
      emailBodyCompleted: `<p>Děkujeme. Smlouva ${docLabel} byla úspěšně podepsána všemi stranami.</p>`,
      signers,
    });
  } catch (err) {
    console.error("[digisign-send] DigiSign failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Odeslání do DigiSign selhalo." },
      { status: 502 },
    );
  }

  const now = new Date().toISOString();
  const updated = {
    ...contract,
    digisignEnvelopeId: result.envelopeId,
    digisignDocumentId: result.documentId,
    digisignStatus: "sent" as const,
    digisignSentAt: now,
    digisignSentBy: g.session.user?.email ?? undefined,
    digisignClientSignedAt: undefined, // reset mezistavu při (opakovaném) odeslání
    updatedAt: now,
  };
  await upsertContract(updated);
  await setEnvelopeContractId(result.envelopeId, contract.id);
  bustContracts();

  return NextResponse.json({ ok: true, contract: updated });
}
