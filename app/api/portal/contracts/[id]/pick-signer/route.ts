import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { getUser } from "@/lib/portal/users-db";
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
  // původního" - pak se signerEmail nenastaví a zástupce ze smlouvy zůstane.
  let signerEmail: string | undefined;
  if (!keepOriginal) {
    if (!parsed.data.email) {
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
    signerEmail = signer.email;
  }

  const now = new Date().toISOString();
  const withSigner = {
    ...contract,
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
  const updated = {
    ...rest,
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  bustContracts();
  return NextResponse.json({ ok: true });
}
