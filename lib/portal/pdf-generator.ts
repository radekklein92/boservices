import chromium from "@sparticuz/chromium-min";

const isDev = process.env.NODE_ENV !== "production";

const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar";

function buildHtml(bodyHtml: string, title: string): string {
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 22mm 20mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
  body {
    font-family: "Manrope", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #0E0E0E;
  }
  h1 {
    font-size: 18pt;
    font-weight: 800;
    letter-spacing: -0.01em;
    margin: 0 0 16pt;
    line-height: 1.2;
  }
  h2 {
    font-size: 13pt;
    font-weight: 700;
    letter-spacing: -0.005em;
    margin: 18pt 0 6pt;
    line-height: 1.25;
    page-break-after: avoid;
  }
  h3 {
    font-size: 11.5pt;
    font-weight: 700;
    margin: 14pt 0 4pt;
    page-break-after: avoid;
  }
  p { margin: 5pt 0; }
  ul, ol { padding-left: 18pt; margin: 5pt 0; }
  ul { list-style: disc; }
  ol { list-style: decimal; }
  blockquote {
    border-left: 1pt solid #BFC3C7;
    padding-left: 10pt;
    color: #2A2A2A;
    margin: 8pt 0;
  }
  strong { font-weight: 700; }
  em { font-style: italic; }
  a { color: #0E0E0E; text-decoration: underline; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0; }
  th, td { border: 1pt solid #E8ECE9; padding: 4pt 6pt; text-align: left; }
  thead th { background: #F2F3F1; font-weight: 700; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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
  title: string,
): Promise<Buffer> {
  const puppeteer = (await import("puppeteer-core")).default;
  const executablePath = await getExecutablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
    defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 1 },
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(bodyHtml, title), {
      waitUntil: "load",
    });
    await page.evaluateHandle("document.fonts.ready");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
