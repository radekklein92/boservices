import { CONTRACT_TYPE_META, type ContractType } from "./contract-types";
import {
  WORDMARK_PNG_BASE64,
  WORDMARK_ASPECT,
} from "./assets/wordmark";

export interface CoverHeader {
  title: string;
  subtitle: string;
}

const COVER_BY_TYPE: Record<ContractType, CoverHeader> = {
  franchise: {
    title: "Franšízingová smlouva",
    subtitle: "uzavřená dle § 2358 a násl. zákona č. 89/2012 Sb., občanský zákoník",
  },
  cooperation: {
    title: "Smlouva o spolupráci a podpoře při provozování provozovny",
    subtitle: "uzavřená dle § 1746 odst. 2 zákona č. 89/2012 Sb., občanský zákoník",
  },
  operation: {
    title: "Smlouva o provozování provozovny",
    subtitle: "uzavřená dle § 1746 odst. 2 zákona č. 89/2012 Sb., občanský zákoník",
  },
  "claim-assignment": {
    title: "Smlouva o postoupení pohledávek",
    subtitle: "uzavřená dle § 1879 a násl. zákona č. 89/2012 Sb., občanský zákoník",
  },
  "side-fee": {
    title: "Vedlejší ujednání o úplatě",
    subtitle: "k smlouvě o spolupráci a podpoře při provozování provozovny",
  },
  "assignment-notice": {
    title: "Oznámení o postoupení pohledávky",
    subtitle: "ve smyslu § 1882 zákona č. 89/2012 Sb., občanský zákoník",
  },
  "claim-bundle": {
    title: "Postoupení pohledávek",
    subtitle:
      "balíček obsahuje smlouvu o postoupení, vedlejší ujednání o úplatě a oznámení dlužníkovi",
  },
  withdrawal: {
    title: "Odstoupení od smluv",
    subtitle:
      "jednostranný projev vůle dle § 2002 a § 1727 zákona č. 89/2012 Sb., občanský zákoník",
  },
  nda: {
    title: "Dohoda o mlčenlivosti",
    subtitle: "uzavřená dle § 1746 odst. 2 zákona č. 89/2012 Sb., občanský zákoník",
  },
};

export function getCoverForType(type: ContractType): CoverHeader {
  return COVER_BY_TYPE[type] ?? {
    title: CONTRACT_TYPE_META[type].fullName,
    subtitle: "",
  };
}


export const PDF_PAGE_STYLES = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Manrope", "Inter", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.6;
    color: #0E0E0E;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }

  /* Cover hlavička první stránky (auto-prepend) */
  .first-page-header {
    margin: 0 0 22pt 0;
    padding-bottom: 14pt;
    border-bottom: 1pt solid #0E0E0E;
  }
  .first-page-header .eyebrow {
    font-size: 7.5pt;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #6F7672;
    margin: 0 0 8pt 0;
  }
  .first-page-header h1.first-page-title {
    font-size: 22pt;
    font-weight: 800;
    margin: 0 0 4pt 0;
    color: #0E0E0E;
    letter-spacing: -0.02em;
    line-height: 1.12;
  }
  .first-page-header .first-page-subtitle {
    font-size: 9pt;
    font-style: italic;
    color: #6F7672;
    margin: 0;
    line-height: 1.4;
  }

  h1 {
    font-size: 20pt;
    font-weight: 800;
    margin: 0 0 12pt 0;
    color: #0E0E0E;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  h2 {
    font-size: 12pt;
    font-weight: 700;
    margin: 22pt 0 8pt 0;
    color: #0E0E0E;
    border-bottom: 0.6pt solid #0E0E0E;
    padding-bottom: 3pt;
    letter-spacing: -0.01em;
    page-break-after: avoid;
  }
  h3 {
    font-size: 10.5pt;
    font-weight: 700;
    margin: 14pt 0 4pt 0;
    color: #0E0E0E;
    page-break-after: avoid;
  }
  p { margin: 0 0 7pt 0; }

  ul {
    padding-left: 16pt;
    margin: 6pt 0;
    list-style: disc;
  }
  ul > li { margin-bottom: 3pt; }

  /* Top-level ordered list = čísla (1, 2, 3, ...) */
  ol {
    padding-left: 22pt;
    margin: 8pt 0;
  }
  ol > li {
    margin-bottom: 5pt;
    padding-left: 4pt;
  }
  ol > li::marker {
    font-weight: 700;
    color: #0E0E0E;
  }

  /* Vnořený ordered list = písmena (a), b), c), ...) */
  ol > li > ol {
    list-style: none;
    padding-left: 28pt;
    margin: 6pt 0;
    counter-reset: contract-sub;
  }
  ol > li > ol > li {
    counter-increment: contract-sub;
    position: relative;
    padding-left: 18pt;
    margin-bottom: 5pt;
  }
  ol > li > ol > li::marker { content: ""; }
  ol > li > ol > li::before {
    content: counter(contract-sub, lower-alpha) ")";
    position: absolute;
    left: 0;
    top: 0;
    font-weight: 700;
    color: #0E0E0E;
  }

  strong { font-weight: 700; }
  em { font-style: italic; }
  blockquote {
    border-left: 1.5pt solid #0E0E0E;
    padding-left: 10pt;
    color: #2A2A2A;
    font-style: italic;
    margin: 8pt 0;
  }
  a { color: #0E0E0E; text-decoration: underline; text-underline-offset: 2pt; }
  code {
    font-family: "JetBrains Mono", "Courier New", monospace;
    background: #F2F3F1;
    padding: 1pt 3pt;
    border-radius: 2pt;
    font-size: 0.92em;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 8pt 0;
  }
  td, th {
    border: 0.5pt solid #E8ECE9;
    padding: 4pt 6pt;
    vertical-align: top;
    text-align: left;
  }
  th { background: #F2F3F1; font-weight: 700; }

  hr {
    border: none;
    border-top: 0.5pt solid #BFC3C7;
    margin: 12pt 0;
  }

  /* Signature blocks (typický pattern dvou podpisových rámců) - celá sekce
   * pohromadě, a navíc každý odstavec (jeden podepisující) jako celek, ať se
   * podpis nerozlomí přes konec stránky ani když je sekce vysoká. */
  /* Podpisová sekce se jako celek smí lámat přes stránky (využije zbytek
   * předchozí strany). Pohromadě drží jen .sign-unit = datum + jeho podpis. */
  .signatures { margin-top: 26pt; }
  .signatures p { page-break-inside: avoid; break-inside: avoid; }
  .sign-unit { break-inside: avoid; page-break-inside: avoid; }

  /* Příloha č. 1 (seznam pohledávek) - vždy začíná na samostatné stránce.
   * Tabulka NESMÍ mít break-inside: avoid - bývá delší než stránka, a Chrome by
   * ji pak celou odsunul na další stranu (nadpis by zůstal sám). Necháme ji téct
   * hned za nadpisem; nedělíme jen jednotlivé řádky a hlavičku opakujeme. */
  .claims-appendix {
    break-before: page;
    page-break-before: always;
  }
  .claims-appendix h2 {
    break-after: avoid;
    page-break-after: avoid;
  }
  .claims-appendix tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .claims-appendix thead {
    display: table-header-group;
  }
  .claims-appendix-sign {
    margin-top: 28pt;
  }

  /* Bundle (claim-bundle) - oddělovač sekcí. První sekce zůstává hned za cover
   * hlavičkou, další 2 začínají na nové stránce s vlastním sekčním titulkem. */
  .bundle-section { break-inside: auto; }
  .bundle-section + .bundle-section { break-before: page; page-break-before: always; }
  .bundle-section-header {
    margin: 0 0 18pt 0;
    padding-bottom: 10pt;
    border-bottom: 0.6pt solid #0E0E0E;
  }
  .bundle-section-header .eyebrow {
    font-size: 7.5pt;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #6F7672;
    margin: 0 0 4pt 0;
  }
  .bundle-section-header h2.bundle-section-title {
    font-size: 16pt;
    font-weight: 800;
    margin: 0;
    color: #0E0E0E;
    letter-spacing: -0.02em;
    border: none;
    padding: 0;
    line-height: 1.18;
  }

  /* Smlouvy bez hlavičkového papíru (Clamora postoupení, klientovo odstoupení).
   * Vizuálně úplně jiný dokument než BOServices franšízingové smlouvy:
   * - serif (Crimson Pro)
   * - sekce bez plného podtržení; mezi sekcemi centrovaná ozdoba „§ § §"
   * - drobné typografické úpravy (větší řádkování, uppercase malé h2). */
  body.no-letterhead {
    font-family: "Crimson Pro", "Source Serif Pro", Georgia, "Times New Roman", Cambria, serif;
    line-height: 1.62;
  }
  body.no-letterhead h1,
  body.no-letterhead h2,
  body.no-letterhead h3,
  body.no-letterhead strong,
  body.no-letterhead em,
  body.no-letterhead p,
  body.no-letterhead li {
    font-family: "Crimson Pro", "Source Serif Pro", Georgia, "Times New Roman", Cambria, serif;
  }
  body.no-letterhead h2 {
    border: none;
    padding: 0;
    margin: 22pt 0 9pt 0;
    font-size: 10.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  /* Centrovaná ozdoba mezi sekcemi (před každým h2 kromě prvního v jeho rodiči).
   * Podpisová sekce je obalená v .signatures, takže její „Podpisy" h2 je
   * first-of-type ve svém rodiči - ozdobu mu doplníme explicitně (sekce je vždy
   * až za jinými, divider tam patří vždy). */
  body.no-letterhead h2:not(:first-of-type)::before,
  body.no-letterhead .signatures > h2::before {
    content: "§ § §";
    display: block;
    text-align: center;
    margin: 4pt auto 16pt auto;
    font-family: "Crimson Pro", Georgia, serif;
    font-size: 11pt;
    font-weight: 400;
    letter-spacing: 0.6em;
    color: #9CA39E;
    text-transform: none;
  }
  /* Cover titulek první stránky - velký serif místo Manrope. */
  body.no-letterhead h1.first-page-title {
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  /* Bundle: hlavička sekce má svůj velký titulek - vrátit normální vzhled
   * (přebije se uppercase z body.no-letterhead h2). */
  body.no-letterhead h2.bundle-section-title {
    font-size: 16pt;
    font-weight: 700;
    text-transform: none;
    letter-spacing: -0.01em;
    margin: 0;
  }
  body.no-letterhead h2.bundle-section-title::before {
    content: none;
  }
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderFirstPageHeader(cover: CoverHeader): string {
  return `<div class="first-page-header">
  <h1 class="first-page-title">${escapeHtml(cover.title)}</h1>
  ${cover.subtitle ? `<p class="first-page-subtitle">${escapeHtml(cover.subtitle)}</p>` : ""}
</div>`;
}

// Stripuje duplicitní H1 ze začátku body šablony — cover hlavička se vždy
// generuje automaticky, takže když user nechá v editoru H1 s názvem smlouvy,
// neukáže se 2×.
function stripDuplicateTitle(html: string, title: string): string {
  const titleEsc = title
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const re = new RegExp(`^\\s*<h1[^>]*>\\s*${titleEsc}\\s*</h1>\\s*`, "i");
  return html.replace(re, "");
}

export const PDF_DIFF_STYLES = `
  ins {
    background: rgba(220, 38, 38, 0.10);
    color: #B91C1C;
    text-decoration: underline;
    text-decoration-color: #B91C1C;
    text-decoration-thickness: 0.5pt;
    text-underline-offset: 2pt;
  }
  del {
    background: rgba(220, 38, 38, 0.06);
    color: #B91C1C;
    text-decoration: line-through;
    text-decoration-color: #B91C1C;
    text-decoration-thickness: 0.5pt;
  }
`;

// Bundle: cover má jeden hlavní titulek (např. „Postoupení pohledávek - balíček"),
// pak 3 sekce za sebou, mezi nimi page-break. První sekce začíná hned po cover
// hlavičce (žádný extra header pro 1. sekci? - ne, pro konzistenci dáme všem).
export interface BundleSectionInput {
  type: ContractType;
  html: string;
}

function renderBundleBody(sections: BundleSectionInput[]): string {
  return sections
    .map((section) => {
      const sectionCover = getCoverForType(section.type);
      const stripped = stripDuplicateTitle(section.html, sectionCover.title);
      return `<section class="bundle-section">
  <div class="bundle-section-header">
    <p class="eyebrow">Dokument</p>
    <h2 class="bundle-section-title">${escapeHtml(sectionCover.title)}</h2>
  </div>
  ${stripped}
</section>`;
    })
    .join("\n");
}

// Watermark renderujeme jako fixed-positioned ::before pseudo na <body>.
// Chrome v print režimu opakuje position:fixed na každé stránce, takže
// stejný watermark prosvítá přes celý dokument. Lehce průhledný šedý text
// rotovaný -30° napříč stránkou. Používá se pro preview (status < k-podpisu).
const PDF_WATERMARK_STYLES = `
body::before {
  content: "NÁVRH — nepoužívat k podpisu";
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-30deg);
  font-family: "Manrope", sans-serif;
  font-weight: 800;
  font-size: 64pt;
  letter-spacing: -0.02em;
  color: rgba(14, 14, 14, 0.08);
  white-space: nowrap;
  pointer-events: none;
  z-index: 9999;
}
`;

function wrapPdfShell(
  body: string,
  opts: { diff?: boolean; watermark?: boolean; letterhead?: boolean },
): string {
  const diffStyles = opts.diff ? PDF_DIFF_STYLES : "";
  const watermarkStyles = opts.watermark ? PDF_WATERMARK_STYLES : "";
  // letterhead === false: PDF jiné firmy (Clamora postoupení / klientovo
  // odstoupení) - serif font, ozdobný oddělovač sekcí. Vizuálně odlišné od
  // BOServices franšízingových smluv.
  const noLetterhead = opts.letterhead === false;
  const bodyClass = noLetterhead ? ' class="no-letterhead"' : "";
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800${noLetterhead ? "&family=Crimson+Pro:wght@400;500;600;700" : ""}&display=swap" rel="stylesheet">
<style>${PDF_PAGE_STYLES}
${diffStyles}
${watermarkStyles}
.__fontwarmup {
  position: absolute;
  top: -9999px;
  left: -9999px;
  visibility: hidden;
}
</style>
</head>
<body${bodyClass}>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:400">Mq</div>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:500">Mq</div>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:600">Mq</div>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:700">Mq</div>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:800">Mq</div>
${noLetterhead ? `<div class="__fontwarmup" style="font-family:'Crimson Pro';font-weight:400">Mq</div>
<div class="__fontwarmup" style="font-family:'Crimson Pro';font-weight:500">Mq</div>
<div class="__fontwarmup" style="font-family:'Crimson Pro';font-weight:600">Mq</div>
<div class="__fontwarmup" style="font-family:'Crimson Pro';font-weight:700">Mq</div>` : ""}
${body}
</body>
</html>`;
}

export function buildServerPdfDocument(
  html: string,
  opts: {
    cover: CoverHeader;
    diff?: boolean;
    watermark?: boolean;
    letterhead?: boolean;
  },
): string {
  const stripped = stripDuplicateTitle(html, opts.cover.title);
  const contentWithHeader = renderFirstPageHeader(opts.cover) + stripped;
  return wrapPdfShell(contentWithHeader, {
    diff: opts.diff,
    watermark: opts.watermark,
    letterhead: opts.letterhead,
  });
}

// Bundle PDF: cover hlavička balíčku + sekce s vlastními pod-headery oddělené
// page-breakem. Jediné puppeteer page.pdf() volání zajistí souvislou paginaci
// a jednotný header/footer napříč všemi 3 dokumenty.
export function buildServerBundlePdfDocument(
  sections: BundleSectionInput[],
  opts: {
    cover: CoverHeader;
    diff?: boolean;
    watermark?: boolean;
    letterhead?: boolean;
  },
): string {
  const body = renderFirstPageHeader(opts.cover) + renderBundleBody(sections);
  return wrapPdfShell(body, {
    diff: opts.diff,
    watermark: opts.watermark,
    letterhead: opts.letterhead,
  });
}

// SVG logo inline pro puppeteer headerTemplate (žádný external import)
export const HEADER_LOGO_SVG = `<svg width="14" height="14" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" rx="22" fill="#0E0E0E"/><g transform="translate(60 60)" fill="#FFFFFF"><path d="M 0 -38 C 16 -38 30 -28 32 -8 C 32 -8 26 -14 18 -18 C 6 -22 0 -28 0 -38 Z"/><path d="M 0 -38 C 16 -38 30 -28 32 -8 C 32 -8 26 -14 18 -18 C 6 -22 0 -28 0 -38 Z" transform="rotate(90)"/><path d="M 0 -38 C 16 -38 30 -28 32 -8 C 32 -8 26 -14 18 -18 C 6 -22 0 -28 0 -38 Z" transform="rotate(180)"/><path d="M 0 -38 C 16 -38 30 -28 32 -8 C 32 -8 26 -14 18 -18 C 6 -22 0 -28 0 -38 Z" transform="rotate(270)"/></g></svg>`;

function escapeAttrish(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Wordmark "BOServices" je pre-rendered PNG v Manrope ExtraBold.
// Puppeteer headerTemplate nemá přístup k web fontům, takže fontem
// vyrenderovaný text by fallbackoval na Helvetica/Arial. PNG to vyřeší.
// Velikost: height 11px (vysoká kvalita 2x DPR) -> width = 11 * 5.25 ≈ 58px.
const WORDMARK_HEIGHT_PX = 11;
const WORDMARK_WIDTH_PX = Math.round(WORDMARK_HEIGHT_PX * WORDMARK_ASPECT);

export function buildHeaderTemplate(
  title: string,
  contractNumber?: string,
): string {
  const safeTitle = escapeAttrish(title);
  const numberPart = contractNumber
    ? `<span style="margin-left: auto; font-size: 7pt; letter-spacing: 0.18em; text-transform: uppercase; color: #6F7672; font-variant-numeric: tabular-nums; white-space: nowrap;">Smlouva ${escapeAttrish(contractNumber)}</span>`
    : "";
  return `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 7.5pt; width: 100%; padding: 6mm 12mm 0 12mm; display: flex; align-items: center; color: #0E0E0E;">
  ${HEADER_LOGO_SVG}
  <img src="data:image/png;base64,${WORDMARK_PNG_BASE64}" width="${WORDMARK_WIDTH_PX}" height="${WORDMARK_HEIGHT_PX}" alt="BOServices" style="display: block; margin-left: 3pt;" />
  <span style="margin: 0 7pt; color: #BFC3C7;">·</span>
  <span style="font-size: 7pt; letter-spacing: 0.18em; text-transform: uppercase; color: #6F7672;">${safeTitle}</span>
  ${numberPart}
</div>`;
}

// Záhlaví jen s číslem smlouvy vpravo nahoře - pro PDF bez hlavičkového papíru
// (letterhead=false). Bez čísla se chová jako prázdné záhlaví.
export function buildNumberHeaderTemplate(contractNumber?: string): string {
  if (!contractNumber) {
    return `<div style="font-size: 0; height: 0; width: 100%;"></div>`;
  }
  return `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; width: 100%; padding: 6mm 12mm 0 12mm; text-align: right; color: #6F7672;">
  <span style="font-size: 7pt; letter-spacing: 0.18em; text-transform: uppercase; font-variant-numeric: tabular-nums; white-space: nowrap;">Smlouva ${escapeAttrish(contractNumber)}</span>
</div>`;
}

export const FOOTER_TEMPLATE = `<div style="font-family: 'Manrope', sans-serif; font-size: 8pt; width: 100%; padding: 0 12mm 4mm 12mm; display: flex; justify-content: space-between; align-items: center; color: #6F7672;">
  <span style="letter-spacing: 0.18em; text-transform: uppercase; font-size: 7pt;">Provoz · Lidé · Standard · Růst</span>
  <span style="font-variant-numeric: tabular-nums;"><span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;

// „Bez hlavičkového papíru" - header bez loga (jen placeholder pro správné
// odsazení obsahu, puppeteer ignoruje úplně prázdný element) a footer jen
// s číslováním. Cover stránka v body zůstává.
export const BLANK_HEADER_TEMPLATE = `<div style="font-size: 0; height: 0; width: 100%;"></div>`;

export const MINIMAL_FOOTER_TEMPLATE = `<div style="font-family: 'Manrope', sans-serif; font-size: 8pt; width: 100%; padding: 0 12mm 4mm 12mm; text-align: center; color: #6F7672;">
  <span style="font-variant-numeric: tabular-nums;"><span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;
