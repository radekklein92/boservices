import chromium from "@sparticuz/chromium-min";
import {
  buildServerPdfDocument,
  buildServerBundlePdfDocument,
  buildHeaderTemplate,
  buildNumberHeaderTemplate,
  getCoverForType,
  FOOTER_TEMPLATE,
  MINIMAL_FOOTER_TEMPLATE,
  type BundleSectionInput,
  type CoverHeader,
} from "./pdf-styles";
import { CONTRACT_TYPE_META, type ContractType } from "./contract-types";

const isDev = process.env.NODE_ENV !== "production";

const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar";

async function getExecutablePath(): Promise<string | undefined> {
  if (isDev) {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ];
    const fs = await import("node:fs");
    for (const path of candidates) {
      try {
        await fs.promises.access(path);
        return path;
      } catch {
        // try next
      }
    }
  }
  return chromium.executablePath(CHROMIUM_PACK_URL);
}

export async function htmlToPdfBuffer(
  bodyHtml: string,
  opts: {
    type: ContractType;
    cover?: CoverHeader;
    diff?: boolean;
    letterhead?: boolean;
    // Watermark přes celý dokument (nefinální PDF a přehled změn). Používá se
    // pro preview ve stavech Koncept a Schváleno (před výběrem podepisujícího).
    watermark?: boolean;
    // Jméno příjemce ve vodoznaku (ochrana proti přeposílání). Bez něj jen
    // generický label „NÁVRH · NEPOUŽÍVAT K PODPISU".
    watermarkText?: string;
    // Číslo smlouvy - zobrazí se v záhlaví vpravo nahoře na každé stránce.
    number?: string;
  },
): Promise<Buffer> {
  const cover = opts.cover ?? getCoverForType(opts.type);
  const fullHtml = buildServerPdfDocument(bodyHtml, {
    cover,
    diff: opts.diff,
    watermark: opts.watermark,
    watermarkText: opts.watermarkText,
    letterhead: opts.letterhead,
  });
  return renderHtmlToPdf(fullHtml, opts.type, opts.letterhead, opts.number);
}

// Bundle (claim-bundle): konkatenuje N renderovaných HTML do jednoho PDF
// s page-break mezi sekcemi. Headery/footery jsou jednotné napříč všemi sekcemi.
export async function bundleHtmlToPdfBuffer(
  sections: BundleSectionInput[],
  opts: {
    type: ContractType;
    cover?: CoverHeader;
    diff?: boolean;
    letterhead?: boolean;
    watermark?: boolean;
    watermarkText?: string;
    number?: string;
  },
): Promise<Buffer> {
  const cover = opts.cover ?? getCoverForType(opts.type);
  const fullHtml = buildServerBundlePdfDocument(sections, {
    cover,
    diff: opts.diff,
    watermark: opts.watermark,
    watermarkText: opts.watermarkText,
    letterhead: opts.letterhead,
  });
  return renderHtmlToPdf(fullHtml, opts.type, opts.letterhead, opts.number);
}

async function renderHtmlToPdf(
  fullHtml: string,
  type: ContractType,
  letterhead: boolean = true,
  contractNumber?: string,
): Promise<Buffer> {

  const puppeteer = (await import("puppeteer-core")).default;
  const executablePath = await getExecutablePath();

  const browser = await puppeteer.launch({
    args: [
      ...chromium.args,
      "--hide-scrollbars",
      "--disable-web-security",
      "--font-render-hinting=none",
    ],
    executablePath,
    headless: true,
    defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 1 },
  });

  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "load" });

    // Force-load font weights a počkat na fonts.ready. Manrope se používá vždy
    // (cover, headery, bundle titulky). Crimson Pro jen u smluv bez hlavičkového
    // papíru (Clamora postoupení, klientovo odstoupení) - načítáme ho jen tam.
    await page.evaluate(async (loadCrimson: boolean) => {
      const manrope = ["400", "500", "600", "700", "800"];
      const crimson = ["400", "500", "600", "700"];
      const promises: Promise<unknown>[] = manrope.map((w) =>
        document.fonts.load(`${w} 12pt "Manrope"`),
      );
      if (loadCrimson) {
        for (const w of crimson) {
          promises.push(document.fonts.load(`${w} 12pt "Crimson Pro"`));
        }
      }
      await Promise.all(promises);
      await document.fonts.ready;
    }, !letterhead);

    const headerTitle = CONTRACT_TYPE_META[type].shortName;

    // Bez hlavičkového papíru: vypustíme logo header i brand footer. Číslo
    // smlouvy se ale zobrazuje vždy (vpravo nahoře) - i u bez-hlavičkových PDF.
    const headerTemplate = letterhead
      ? buildHeaderTemplate(headerTitle, contractNumber)
      : buildNumberHeaderTemplate(contractNumber);
    const footerTemplate = letterhead
      ? FOOTER_TEMPLATE
      : MINIMAL_FOOTER_TEMPLATE;

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: {
        top: letterhead ? "22mm" : "16mm",
        right: "12mm",
        bottom: "16mm",
        left: "12mm",
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

// Generický landscape PDF render pro exporty (ne smlouvy) - prázdný header,
// footer s číslováním stránek, jen Manrope font. Záměrně oddělené od
// renderHtmlToPdf (kritická cesta všech smluv); sdílí jen launch konfiguraci.
export async function renderExportPdfBuffer(
  fullHtml: string,
  opts?: { landscape?: boolean; footerTemplate?: string },
): Promise<Buffer> {
  const landscape = opts?.landscape ?? true;
  const puppeteer = (await import("puppeteer-core")).default;
  const executablePath = await getExecutablePath();

  const browser = await puppeteer.launch({
    args: [
      ...chromium.args,
      "--hide-scrollbars",
      "--disable-web-security",
      "--font-render-hinting=none",
    ],
    executablePath,
    headless: true,
    defaultViewport: landscape
      ? { width: 1754, height: 1240, deviceScaleFactor: 1 }
      : { width: 1240, height: 1754, deviceScaleFactor: 1 },
  });

  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "load" });
    await page.evaluate(async () => {
      const weights = ["400", "500", "600", "700", "800"];
      await Promise.all(
        weights.map((w) => document.fonts.load(`${w} 12pt "Manrope"`)),
      );
      await document.fonts.ready;
    });

    const pdf = await page.pdf({
      format: "A4",
      landscape,
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:0;height:0;width:100%;"></div>`,
      footerTemplate: opts?.footerTemplate ?? MINIMAL_FOOTER_TEMPLATE,
      margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
