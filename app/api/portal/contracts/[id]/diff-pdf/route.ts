import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { getContract } from "@/lib/portal/contracts-db";
import { getOrSeedContractTemplate } from "@/lib/portal/contract-templates-db";
import { CONTRACT_TYPE_META, isBundleType } from "@/lib/portal/contract-types";
import { htmlDiff } from "@/lib/portal/contract-diff";
import {
  bakeSnapshotForDiff,
  renderTemplate,
  watermarkRecipient,
} from "@/lib/portal/contract-render";
import {
  bundleHtmlToPdfBuffer,
  htmlToPdfBuffer,
} from "@/lib/portal/pdf-generator";
import { getCoverForType } from "@/lib/portal/pdf-styles";

export const maxDuration = 60;

const DIACRITICS: Record<string, string> = {
  á: "a", č: "c", ď: "d", é: "e", ě: "e", í: "i", ň: "n",
  ó: "o", ř: "r", š: "s", ť: "t", ú: "u", ů: "u", ý: "y", ž: "z",
  Á: "A", Č: "C", Ď: "D", É: "E", Ě: "E", Í: "I", Ň: "N",
  Ó: "O", Ř: "R", Š: "S", Ť: "T", Ú: "U", Ů: "U", Ý: "Y", Ž: "Z",
};

function slugify(input: string): string {
  return Array.from(input)
    .map((ch) => DIACRITICS[ch] ?? ch)
    .join("")
    .replace(/[^a-zA-Z0-9.\-_\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 100) || "contract-diff";
}

export async function GET(
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

  const meta = CONTRACT_TYPE_META[contract.type];
  const cover = getCoverForType(contract.type);
  // Přehled změn je vždy pracovní dokument (redline oproti šabloně), nikdy
  // finální čistopis - vodoznak se jménem příjemce drží i tady (ochrana proti
  // přeposílání).
  const watermarkText = watermarkRecipient(contract.variables);

  let pdf: Buffer;
  try {
    if (isBundleType(contract.type) && contract.bundleSections) {
      // Bundle: diff per section, agregovaná kontrola změn.
      const sectionDiffs = contract.bundleSections.map((section) => ({
        type: section.type,
        diff: htmlDiff(section.templateSnapshot, section.html),
      }));
      const totalChanges = sectionDiffs.reduce(
        (sum, s) => sum + s.diff.changeCount,
        0,
      );
      if (totalChanges === 0) {
        return NextResponse.json(
          { ok: false, error: "Smlouva se od šablony neliší - žádné změny k zobrazení." },
          { status: 400 },
        );
      }
      const renderedSections = sectionDiffs.map((s) => ({
        type: s.type,
        html: renderTemplate(s.diff.diffHtml, contract.variables),
      }));
      pdf = await bundleHtmlToPdfBuffer(renderedSections, {
        type: contract.type,
        cover: {
          ...cover,
          subtitle: `${cover.subtitle} · zobrazeny změny oproti šabloně`,
        },
        diff: true,
        watermark: true,
        watermarkText,
        letterhead: contract.letterhead ?? true,
      });
    } else {
      let snapshot = contract.templateSnapshot;
      if (!snapshot) {
        const template = await getOrSeedContractTemplate(contract.type);
        snapshot = template.html;
      }
      // Stejně jako web (Přehled změn): u zapečených smluv zapeč i šablonu, ať
      // se nediffuje „{{token}} vs hodnota" (to dřív rozhazovalo zarovnání).
      const snapshotForDiff = bakeSnapshotForDiff(
        snapshot,
        contract.html,
        contract.variables,
      );
      const result = htmlDiff(snapshotForDiff, contract.html);
      if (!result.hasChanges) {
        return NextResponse.json(
          { ok: false, error: "Smlouva se od šablony neliší - žádné změny k zobrazení." },
          { status: 400 },
        );
      }
      const rendered = renderTemplate(result.diffHtml, contract.variables);
      pdf = await htmlToPdfBuffer(rendered, {
        type: contract.type,
        cover: { ...cover, subtitle: `${cover.subtitle} · zobrazeny změny oproti šabloně` },
        diff: true,
        watermark: true,
        watermarkText,
        letterhead: contract.letterhead ?? true,
      });
    }
  } catch (err) {
    console.error("[contracts] diff PDF render failed", err);
    return NextResponse.json(
      { ok: false, error: "Generování PDF s úpravami selhalo." },
      { status: 500 },
    );
  }

  const filename = slugify(`${meta.shortName}-${contract.clientName}-upravy.pdf`);

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
