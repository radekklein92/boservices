import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { isUnilateralContract } from "@/lib/portal/contract-types";
import { renderAndStoreContractPdf } from "@/lib/portal/pdf-flow";
import { bustContracts } from "@/lib/portal/revalidate";

export const maxDuration = 60;

export async function POST(
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

  const now = new Date().toISOString();
  const withApproval = {
    ...contract,
    approvedAt: now,
    approvedBy: g.session.user!.email!,
    updatedAt: now,
  };
  withApproval.status = computeContractStatus(withApproval);

  // Unilateral typy (odstoupení, oznámení) přechází Schváleno → Podepsáno
  // klientem bez pick-signer kroku. PDF v tomto okamžiku už musí být finální
  // (bez watermarku), aby ho admin mohl vytisknout a předat klientovi.
  let pdfUpload: Awaited<ReturnType<typeof renderAndStoreContractPdf>> | null = null;
  if (isUnilateralContract(contract.type) && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      pdfUpload = await renderAndStoreContractPdf(withApproval);
    } catch (err) {
      console.error("[approve] regenerate PDF failed", { id, err });
    }
  }

  const updated = pdfUpload
    ? {
        ...withApproval,
        generatedPdfUrl: pdfUpload.url,
        generatedPdfPath: pdfUpload.path,
        generatedAt: pdfUpload.generatedAt,
        updatedAt: pdfUpload.generatedAt,
      }
    : withApproval;

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

  // Rollback Schváleno: zruší taky vše navazující, aby status flow byl konzistentní.
  const {
    approvedAt: _a,
    approvedBy: _ab,
    signerEmail: _se,
    signerPickedAt: _sp,
    signerPickedBy: _spb,
    signedAt: _sa,
    signedBy: _sb,
    clientSignedAt: _cs,
    clientSignedBy: _csb,
    ...rest
  } = contract;
  void _a; void _ab; void _se; void _sp; void _spb;
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
