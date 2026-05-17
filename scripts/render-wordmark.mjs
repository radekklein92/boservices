import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@800&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    display: inline-block;
    font-family: "Manrope", sans-serif;
    font-weight: 800;
    font-size: 200px;
    letter-spacing: -0.025em;
    color: #0E0E0E;
    line-height: 1;
    -webkit-font-smoothing: antialiased;
    padding: 0;
  }
</style>
</head>
<body id="root">BOServices</body>
</html>`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 3000, height: 400, deviceScaleFactor: 2 },
});

try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.load("800 200px Manrope");
    await document.fonts.ready;
  });

  // Wait extra tick for paint
  await new Promise((r) => setTimeout(r, 300));

  const root = await page.$("#root");
  if (!root) throw new Error("root not found");
  const box = await root.boundingBox();
  if (!box) throw new Error("no bbox");

  // Tight crop with small padding
  const pad = 4;
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };

  const png = await page.screenshot({
    clip,
    omitBackground: true,
    type: "png",
  });

  const out = "/tmp/bo-wordmark/wordmark.png";
  fs.writeFileSync(out, png);
  console.log(`✓ saved ${out} (${png.length} bytes, ${clip.width}x${clip.height})`);

  const b64 = Buffer.from(png).toString("base64");
  fs.writeFileSync("/tmp/bo-wordmark/wordmark.b64.txt", b64);
  console.log(`✓ saved base64 (${b64.length} chars)`);

  // aspect ratio
  console.log(`  width:height = ${clip.width / clip.height}`);
} finally {
  await browser.close();
}
