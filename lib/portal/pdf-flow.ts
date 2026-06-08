import { put } from "@vercel/blob";
import type { Contract } from "./contracts-db";
import { CONTRACT_TYPE_META, isBundleType } from "./contract-types";
import {
  applySignerOverride,
  groupSignatureUnits,
  renderTemplate,
  stripPlaceholderSpans,
  wrapSignatures,
} from "./contract-render";
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
// Vyrenderuje PDF buffer dle aktuálního stavu smlouvy (bez uploadu). Sdílí logiku
// s renderAndStoreContractPdf - používá ho i DigiSign odeslání (potřebuje buffer).
export async function renderContractPdfBuffer(contract: Contract): Promise<Buffer> {
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
    ? applySignerOverride(contract.variables, signer, {
        poa: contract.type === "nda",
      })
    : contract.variables;

  // Příloha č. 1 - tabulka pohledávek a jejich součet (vč. DPH) se generují
  // systémově z contract.claims (claimsTable + totalClaimsAmount).
  const variables = buildClaimsVariables(baseVariables, contract.claims ?? []);

  const letterhead = contract.letterhead ?? true;
  const watermark = !isFinal;

  // Render-time příprava: příloha na novou stránku (vše), u postoupení navíc
  // odstranění DIČ Clamory a nahrazení čísla účtu linkou (i pro starší smlouvy).
  // Příloha č. 1 s tabulkou pohledávek (token, podpis Postupitele, zalomení na
  // novou stránku) i odstranění DIČ/účtu Clamory patří JEN typům postoupení.
  // Ostatní typy (provozování apod.) mají vlastní Přílohu č. 1 a html projde beze
  // změny - jinak by ensureClaimsToken injektoval token podle nadpisu omylem.
  const isClaim =
    contract.type === "claim-assignment" || contract.type === "claim-bundle";
  // Obal podpisovou sekci do .signatures (page-break-inside: avoid), ať se oba
  // podepisující ani datum neoddělí přes konec stránky - platí i pro serif
  // (no-letterhead) dokumenty. No-op u typů bez „Podpisy" h2 (odstoupení,
  // bundle), takže je bezpečné aplikovat plošně. Serif divider §§§ nad „Podpisy"
  // je zachovaný přes pravidlo .signatures > h2 v pdf-styles.
  const prep = (h: string) => {
    // Odstranit pomocné značky zapečených hodnot (data-ph) - do PDF čistý text.
    const base = stripPlaceholderSpans(h);
    const h1 = wrapSignatures(base);
    const h2 = isClaim ? stripClamoraDicAndBank(prepareClaimsAppendix(h1)) : h1;
    // Datum + jeho podpis vždy pohromadě (.sign-unit); celá podpisová sekce už
    // smí přetéct, takže využije zbytek předchozí stránky.
    return groupSignatureUnits(h2);
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

  return pdf;
}

export async function renderAndStoreContractPdf(contract: Contract): Promise<{
  url: string;
  path: string;
  generatedAt: string;
}> {
  const pdf = await renderContractPdfBuffer(contract);
  const meta = CONTRACT_TYPE_META[contract.type];
  const title = `${meta.shortName} - ${contract.clientName}`;
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
