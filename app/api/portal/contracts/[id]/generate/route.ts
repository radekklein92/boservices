import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { CONTRACT_TYPE_META, isBundleType } from "@/lib/portal/contract-types";
import { applySignerOverride, renderTemplate } from "@/lib/portal/contract-render";
import {
  bundleHtmlToPdfBuffer,
  htmlToPdfBuffer,
} from "@/lib/portal/pdf-generator";
import { getCoverForType } from "@/lib/portal/pdf-styles";
import { getUser } from "@/lib/portal/users-db";

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

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { ok: false, error: "Vercel Blob není nakonfigurován." },
      { status: 500 },
    );
  }

  const meta = CONTRACT_TYPE_META[contract.type];
  const title = `${meta.shortName} - ${contract.clientName}`;
  const cover = getCoverForType(contract.type);

  // Status v okamžiku generace rozhoduje:
  //   - koncept / schvaleno = preview (watermark, žádné signer overrides)
  //   - k-podpisu+ = final (bez watermarku, providerStatutory1* nahrazeny ze
  //     vybraného Podepisujícího v User.signerDisplayName + signerFunction)
  const isFinal = !!contract.signerPickedAt;
  let signer: Awaited<ReturnType<typeof getUser>> = null;
  if (isFinal && contract.signerEmail) {
    signer = await getUser(contract.signerEmail);
  }
  const variables = signer
    ? applySignerOverride(contract.variables, signer)
    : contract.variables;

  let pdf: Buffer;
  try {
    const letterhead = contract.letterhead ?? true;
    const watermark = !isFinal;
    if (isBundleType(contract.type) && contract.bundleSections) {
      // Bundle: render každou sekci samostatně (placeholders), pak konkatenovat.
      const renderedSections = contract.bundleSections.map((section) => ({
        type: section.type,
        html: renderTemplate(section.html, variables),
      }));
      pdf = await bundleHtmlToPdfBuffer(renderedSections, {
        type: contract.type,
        cover,
        letterhead,
        watermark,
      });
    } else {
      const rendered = renderTemplate(contract.html, variables);
      pdf = await htmlToPdfBuffer(rendered, {
        type: contract.type,
        cover,
        letterhead,
        watermark,
      });
    }
  } catch (err) {
    console.error("[contracts] PDF render failed", err);
    return NextResponse.json(
      { ok: false, error: "Generování PDF selhalo." },
      { status: 500 },
    );
  }

  const safeName = slugify(title);
  const path = `portal/contracts/${contract.id}/generated/${Date.now()}-${safeName}.pdf`;

  let uploaded;
  try {
    uploaded = await put(path, pdf, {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (err) {
    console.error("[contracts] Blob upload failed", {
      path,
      message: err instanceof Error ? err.message : String(err),
      err,
    });
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Nahrání PDF do Vercel Blobu selhalo: ${detail}` },
      { status: 500 },
    );
  }

  const now = new Date().toISOString();
  const updated = {
    ...contract,
    generatedPdfUrl: uploaded.url,
    generatedPdfPath: uploaded.pathname,
    generatedAt: now,
    updatedAt: now,
  };
  updated.status = computeContractStatus(updated);
  await upsertContract(updated);

  return NextResponse.json({
    ok: true,
    url: uploaded.url,
  });
}

const DIACRITICS: Record<string, string> = {
  á: "a", č: "c", ď: "d", é: "e", ě: "e", í: "i", ň: "n",
  ó: "o", ř: "r", š: "s", ť: "t", ú: "u", ů: "u", ý: "y", ž: "z",
  Á: "A", Č: "C", Ď: "D", É: "E", Ě: "E", Í: "I", Ň: "N",
  Ó: "O", Ř: "R", Š: "S", Ť: "T", Ú: "U", Ů: "U", Ý: "Y", Ž: "Z",
};

function slugify(input: string): string {
  const stripped = Array.from(input)
    .map((ch) => DIACRITICS[ch] ?? ch)
    .join("")
    .replace(/[^a-zA-Z0-9.\-_\s]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return stripped.slice(0, 100) || "contract";
}
