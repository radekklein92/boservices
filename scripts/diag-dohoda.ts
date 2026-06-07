import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
async function main() {
  const { buildDefaultHtml } = await import("../lib/portal/default-templates.js");
  const { resolveForEditing, WITHDRAWAL_KS_TEXTS } = await import("../lib/portal/contract-render.js");
  const { resolveCover, buildServerPdfDocument } = await import("../lib/portal/pdf-styles.js");
  const puppeteer = (await import("puppeteer-core")).default;

  const vars: Record<string,string> = {
    clientName: "Violetbloom invest s.r.o.", clientIco:"12345678", clientStreet:"Hlavní 1", clientZip:"11000", clientCity:"Praha 1", clientRepresentationClause:"",
    managerName:"Twistcafe s.r.o.", managerIco:"07177658", managerStreet:"Vedlejší 2", managerZip:"11000", managerCity:"Praha",
    providerName:"Trdlokafe International s.r.o.", providerIco:"09999999", providerStreet:"Třetí 3", providerZip:"11000", providerCity:"Praha",
    originContractsDate:"1. ledna 2026", withdrawalLocation:"Kytky od Pepy Štefánikova Praha", leaseLostDate:"1. dubna 2026",
    place:"Praha", contractDate:"7. června 2026",
    providerStatutory1Name:"Ing. Jiří Slavkovský", providerStatutory1Role:"jednatel",
    clientSignerName:"Martin Lančarič", clientSignerRole:"jednatel",
    ...WITHDRAWAL_KS_TEXTS.dropped,
  };
  const body = resolveForEditing(buildDefaultHtml("withdrawal","D"), vars);
  const cover = resolveCover("withdrawal","D");
  console.log("COVER:", JSON.stringify(cover));
  const fullHtml = buildServerPdfDocument(body, { cover, letterhead: false });
  const browser = await puppeteer.launch({ executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless:true, args:["--no-sandbox","--font-render-hinting=none","--disable-web-security"], defaultViewport:{width:1240,height:1754,deviceScaleFactor:1} });
  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil:"domcontentloaded" });
    await new Promise((r)=>setTimeout(r,1500));
    const pdf = await page.pdf({ format:"A4", printBackground:true, margin:{top:"16mm",right:"12mm",bottom:"16mm",left:"12mm"} });
    writeFileSync("/tmp/dohoda.pdf", Buffer.from(pdf));
    console.log("OK bytes", pdf.length);
  } finally { await browser.close().catch(()=>{}); }
}
main().then(()=>process.exit(0)).catch((e)=>{console.error(String(e));process.exit(1);});
