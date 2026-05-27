import { put } from "@vercel/blob";
import type { Contract } from "./contracts-db";
import { CONTRACT_TYPE_META, isBundleType } from "./contract-types";
import { applySignerOverride, renderTemplate } from "./contract-render";
import { bundleHtmlToPdfBuffer, htmlToPdfBuffer } from "./pdf-generator";
import { getCoverForType } from "./pdf-styles";
import { getUser } from "./users-db";
import {
  buildClaimsVariables,
  prepareClaimsAppendix,
  stripClamoraDicAndBank,
} from "./claims";

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

// Vyrenderuje PDF dle aktuálního stavu smlouvy a nahraje ho do Vercel Blob.
// Watermark a signer override se rozhodují automaticky podle status flow:
//   - signerPickedAt set = finální PDF (bez watermarku, s daty signera)
//   - jinak preview (watermark, default provider statutary)
// Vrací { url, path, generatedAt } pro zapsání do Contract záznamu.
// Volající endpoint si zajistí samotný upsertContract.
export async function renderAndStoreContractPdf(contract: Contract): Promise<{
  url: string;
  path: string;
  generatedAt: string;
}> {
  const meta = CONTRACT_TYPE_META[contract.type];
  const title = `${meta.shortName} - ${contract.clientName}`;
  const cover = getCoverForType(contract.type);

  // Finální PDF (bez watermarku) = po kroku „K podpisu" (signerPickedAt) - platí
  // pro všechny typy (odstoupení k němu dojde přes „Připravit k podpisu").
  const isFinal = !!contract.signerPickedAt;
  // Signer override (data podepisujícího za BOS) jen když je signerEmail vybrán -
  // u odstoupení/keepOriginal není, takže se zástupce ze smlouvy nepřepíše.
  const signer =
    isFinal && contract.signerEmail
      ? await getUser(contract.signerEmail)
      : null;
  const baseVariables = signer
    ? applySignerOverride(contract.variables, signer)
    : contract.variables;

  // Příloha č. 1 - tabulka pohledávek a jejich součet (vč. DPH) se generují
  // systémově z contract.claims (claimsTable + totalClaimsAmount).
  const variables = buildClaimsVariables(baseVariables, contract.claims ?? []);

  const letterhead = contract.letterhead ?? true;
  const watermark = !isFinal;

  // Render-time příprava: příloha na novou stránku (vše), u postoupení navíc
  // odstranění DIČ Clamory a nahrazení čísla účtu linkou (i pro starší smlouvy).
  const isClaim =
    contract.type === "claim-assignment" || contract.type === "claim-bundle";
  const prep = (h: string) => {
    const x = prepareClaimsAppendix(h);
    return isClaim ? stripClamoraDicAndBank(x) : x;
  };

  let pdf: Buffer;
  if (isBundleType(contract.type) && contract.bundleSections) {
    const rendered = contract.bundleSections.map((s) => ({
      type: s.type,
      html: renderTemplate(prep(s.html), variables),
    }));
    pdf = await bundleHtmlToPdfBuffer(rendered, {
      type: contract.type,
      cover,
      letterhead,
      watermark,
      number: contract.number,
    });
  } else {
    const rendered = renderTemplate(prep(contract.html), variables);
    pdf = await htmlToPdfBuffer(rendered, {
      type: contract.type,
      cover,
      letterhead,
      watermark,
      number: contract.number,
    });
  }

  const safeName = slugify(title);
  const path = `portal/contracts/${contract.id}/generated/${Date.now()}-${safeName}.pdf`;
  const uploaded = await put(path, pdf, {
    access: "private",
    contentType: "application/pdf",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return {
    url: uploaded.url,
    path: uploaded.pathname,
    generatedAt: new Date().toISOString(),
  };
}
