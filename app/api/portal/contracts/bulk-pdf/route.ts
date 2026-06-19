import { NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import { requireSession } from "@/lib/portal/auth-guard";
import { getContract } from "@/lib/portal/contracts-db";
import { CONTRACT_TYPE_META, isBundleType } from "@/lib/portal/contract-types";
import {
  applySignerOverride,
  renderTemplate,
} from "@/lib/portal/contract-render";
import {
  buildClaimsVariables,
  prepareClaimsAppendix,
  stripClamoraDicAndBank,
} from "@/lib/portal/claims";
import {
  bundleHtmlToPdfBuffer,
  htmlToPdfBuffer,
  launchPdfBrowser,
} from "@/lib/portal/pdf-generator";
import { getCoverForType } from "@/lib/portal/pdf-styles";
import { getUser } from "@/lib/portal/users-db";

export const maxDuration = 300;

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});

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

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Vstup musí obsahovat 1-50 ID smluv." },
      { status: 400 },
    );
  }

  const zip = new JSZip();
  const errors: string[] = [];

  // Načítáme signery do mapy - jednotlivé smlouvy můžou mít stejného signera.
  const signerCache = new Map<string, Awaited<ReturnType<typeof getUser>>>();
  async function loadSigner(email: string) {
    if (signerCache.has(email)) return signerCache.get(email);
    const s = await getUser(email);
    signerCache.set(email, s);
    return s;
  }

  // Vygeneruje jedno finální PDF (s validací). Vrací buď soubor, nebo chybu.
  async function generateOne(
    id: string,
    browser: Awaited<ReturnType<typeof launchPdfBrowser>>,
  ): Promise<{ filename: string; pdf: Buffer } | { error: string }> {
    const contract = await getContract(id);
    if (!contract) return { error: `${id}: nenalezeno` };
    // Finální PDF vyžaduje krok „K podpisu" (signerPickedAt) - platí pro všechny
    // typy (odstoupení k němu dojde přes „Připravit k podpisu").
    if (!contract.signerPickedAt) {
      return { error: `${contract.number ?? id}: musí být ve stavu K podpisu nebo dál` };
    }

    // Finální PDF: bez watermarku, s signer override.
    const signer = contract.signerEmail ? await loadSigner(contract.signerEmail) : null;
    const baseVariables = signer
      ? applySignerOverride(contract.variables, signer)
      : contract.variables;
    // Příloha č. 1: doplnit tabulku pohledávek + součet (vč. DPH) z contract.claims.
    const variables = buildClaimsVariables(baseVariables, contract.claims ?? []);
    const cover = getCoverForType(contract.type);
    const letterhead = contract.letterhead ?? true;
    // Příloha pohledávek (token, podpis, zalomení) i strip Clamory jen u typů
    // postoupení; ostatní typy projdou beze změny (jinak by ensureClaimsToken
    // omylem injektoval token podle nadpisu „Příloha č. 1...").
    const isClaim =
      contract.type === "claim-assignment" || contract.type === "claim-bundle";
    const prep = (h: string) =>
      isClaim ? stripClamoraDicAndBank(prepareClaimsAppendix(h)) : h;

    try {
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
          watermark: false,
          number: contract.number,
          browser,
        });
      } else {
        const rendered = renderTemplate(prep(contract.html), variables);
        pdf = await htmlToPdfBuffer(rendered, {
          type: contract.type,
          cover,
          letterhead,
          watermark: false,
          number: contract.number,
          browser,
        });
      }

      const numberPart = contract.number ? slugify(contract.number) : id.slice(0, 8);
      const namePart = slugify(contract.clientName);
      const typePart = slugify(CONTRACT_TYPE_META[contract.type].shortName);
      const filename = `${numberPart}-${typePart}-${namePart}.pdf`;
      return { filename, pdf };
    } catch (err) {
      console.error("[bulk-pdf] PDF render failed", { id, err });
      return { error: `${contract.number ?? id}: generování selhalo` };
    }
  }

  // Jeden sdílený browser pro celou dávku (místo launch-per-smlouva) + generování
  // s omezenou paralelizací. Dřív: až 50 cold-startů Chromia sekvenčně.
  const CONCURRENCY = 3;
  const browser = await launchPdfBrowser();
  try {
    for (let i = 0; i < parsed.data.ids.length; i += CONCURRENCY) {
      const batch = parsed.data.ids.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(batch.map((id) => generateOne(id, browser)));
      for (const r of settled) {
        if ("error" in r) errors.push(r.error);
        else zip.file(r.filename, r.pdf);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  const fileCount = Object.keys(zip.files).length;
  if (fileCount === 0) {
    return NextResponse.json(
      { ok: false, error: errors.join("; ") || "Nepodařilo se vygenerovat žádné PDF." },
      { status: 400 },
    );
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const filename = `smlouvy-${stamp}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Filename": filename,
      // Necacheovat - každé volání je čerstvé generování.
      "Cache-Control": "no-store",
    },
  });
}
