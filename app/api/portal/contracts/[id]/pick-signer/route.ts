import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { getUser } from "@/lib/portal/users-db";
import {
  applySignerOverride,
  getProviderDefaults,
  setBakedValue,
} from "@/lib/portal/contract-render";
import { renderAndStoreContractPdf } from "@/lib/portal/pdf-flow";
import { bustContracts } from "@/lib/portal/revalidate";

export const maxDuration = 60;

const pickSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  // „Zachovat původního podepisujícího": nenastaví signerEmail -> v PDF se
  // nepřepíše zástupce uvedený ve smlouvě (např. Mgr. Petr Zapletal).
  keepOriginal: z.boolean().optional(),
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
      { ok: false, error: "Neplatný vstup." },
      { status: 400 },
    );
  }
  const keepOriginal = parsed.data.keepOriginal === true;

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

  // Buď konkrétní Podepisující (override zástupce v PDF), nebo „zachovat
  // původního" - pak se signerEmail nenastaví a vrátí se výchozí zástupce.
  let signerEmail: string | undefined;
  let signer: Awaited<ReturnType<typeof getUser>> | null = null;
  if (!keepOriginal) {
    if (!parsed.data.email) {
      return NextResponse.json(
        { ok: false, error: "Chybí email podepisujícího." },
        { status: 400 },
      );
    }
    signer = await getUser(parsed.data.email);
    if (!signer) {
      return NextResponse.json(
        { ok: false, error: "Podepisující nenalezen." },
        { status: 404 },
      );
    }
    // NDA se podepisuje přes DigiSign - podepisovat smí kterýkoliv uživatel
    // s telefonem (na základě plné moci); u ostatních typů jen Podepisující.
    if (contract.type === "nda") {
      if (!signer.phone || !signer.phone.trim()) {
        return NextResponse.json(
          { ok: false, error: "Vybraný uživatel nemá v profilu telefon (DigiSign ho vyžaduje)." },
          { status: 400 },
        );
      }
    } else if (!signer.isSigner || !signer.signerFunction) {
      return NextResponse.json(
        { ok: false, error: "Vybraný uživatel není podepisující." },
        { status: 400 },
      );
    }
    signerEmail = signer.email;
  }

  const now = new Date().toISOString();

  // Zapečené znění má jméno/funkci zástupce poskytovatele přímo v textu. Při
  // výběru jiného podepisujícího ho v textu přepíšeme; „zachovat původního"
  // vrátí výchozího zástupce poskytovatele. variables držíme v souladu.
  const oldName = contract.variables.providerStatutory1Name ?? "";
  const oldRole = contract.variables.providerStatutory1Role ?? "";
  let newName = oldName;
  let newRole = oldRole;
  if (signer) {
    const ov = applySignerOverride(contract.variables, signer, {
      poa: contract.type === "nda",
    });
    newName = ov.providerStatutory1Name ?? oldName;
    newRole = ov.providerStatutory1Role ?? oldRole;
  } else {
    const defaults = getProviderDefaults(contract.type);
    newName = defaults.providerStatutory1Name ?? oldName;
    newRole = defaults.providerStatutory1Role ?? oldRole;
  }
  const nextVariables =
    newName !== oldName || newRole !== oldRole
      ? {
          ...contract.variables,
          providerStatutory1Name: newName,
          providerStatutory1Role: newRole,
        }
      : contract.variables;
  // Klíčovaný přepis hodnoty v zapečeném textu (značky data-ph).
  let nextHtml = setBakedValue(contract.html, "providerStatutory1Name", newName);
  nextHtml = setBakedValue(nextHtml, "providerStatutory1Role", newRole);

  const withSigner = {
    ...contract,
    variables: nextVariables,
    html: nextHtml,
    // U „zachovat původního" explicitně vyčistíme signerEmail (undefined se
    // při uložení do Redisu zahodí) - render pak nepřepíše zástupce.
    signerEmail,
    signerPickedAt: contract.signerPickedAt ?? now,
    signerPickedBy: g.session.user!.email!,
    updatedAt: now,
  };
  withSigner.status = computeContractStatus(withSigner);

  // Po přiřazení podepisujícího automaticky vygenerujeme finální PDF (bez
  // watermarku, s daty signera) - jinak by Stáhnout PDF servíroval starou
  // preview verzi z fáze Schváleno.
  let pdfUpload: Awaited<ReturnType<typeof renderAndStoreContractPdf>> | null = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      pdfUpload = await renderAndStoreContractPdf(withSigner);
    } catch (err) {
      console.error("[pick-signer] regenerate PDF failed", { id, err });
      // PDF regen je best-effort - signer se uloží i tak; uživatel může
      // ručně přegenerovat tlačítkem v hlavičce.
    }
  }

  const updated = pdfUpload
    ? {
        ...withSigner,
        generatedPdfUrl: pdfUpload.url,
        generatedPdfPath: pdfUpload.path,
        generatedAt: pdfUpload.generatedAt,
        updatedAt: pdfUpload.generatedAt,
      }
    : withSigner;

  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true, regenerated: !!pdfUpload });
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

  // Vrátit zástupce poskytovatele v zapečeném textu na výchozího (po výběru
  // podepisujícího tam zůstalo jeho jméno).
  const defaults = getProviderDefaults(contract.type);
  const oldName = contract.variables.providerStatutory1Name ?? "";
  const oldRole = contract.variables.providerStatutory1Role ?? "";
  const newName = defaults.providerStatutory1Name ?? oldName;
  const newRole = defaults.providerStatutory1Role ?? oldRole;
  let revertedHtml = setBakedValue(rest.html, "providerStatutory1Name", newName);
  revertedHtml = setBakedValue(revertedHtml, "providerStatutory1Role", newRole);

  const updated = {
    ...rest,
    variables:
      newName !== oldName || newRole !== oldRole
        ? {
            ...rest.variables,
            providerStatutory1Name: newName,
            providerStatutory1Role: newRole,
          }
        : rest.variables,
    html: revertedHtml,
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
