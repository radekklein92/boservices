import chromium from "@sparticuz/chromium-min";
import {
  buildServerPdfDocument,
  getCoverForType,
  HEADER_TEMPLATE,
  FOOTER_TEMPLATE,
  type CoverHeader,
} from "./pdf-styles";
import type { ContractType } from "./contract-types";

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
  opts: { type: ContractType; cover?: CoverHeader },
): Promise<Buffer> {
  const cover = opts.cover ?? getCoverForType(opts.type);
  const fullHtml = buildServerPdfDocument(bodyHtml, { cover });

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

    // Force-load Manrope weights and wait for fonts.ready
    await page.evaluate(async () => {
      const variants = ["400", "500", "600", "700", "800"];
      await Promise.all(
        variants.map((w) => document.fonts.load(`${w} 12pt "Manrope"`)),
      );
      await document.fonts.ready;
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: HEADER_TEMPLATE,
      footerTemplate: FOOTER_TEMPLATE,
      margin: {
        top: "22mm",
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
