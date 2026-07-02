// PDF faktury (daňový doklad) - vizuální jazyk dokumentů BOServices
// (pdf-styles.ts / design manuál): Manrope, hairline dividery, eyebrow
// s prostrkáním, JetBrains Mono pro čísla a částky. Render přes sdílený
// renderExportPdfBuffer (portrait, brand footer „Provoz · Lidé · Standard ·
// Růst"). Návrh = watermark NÁVRH (dlaždicová mřížka jako u smluv) a bez čísla.

import { PDF_PAGE_STYLES, HEADER_LOGO_SVG, FOOTER_TEMPLATE } from "./pdf-styles";
import { renderExportPdfBuffer } from "./pdf-generator";
import { WORDMARK_PNG_BASE64, WORDMARK_ASPECT } from "./assets/wordmark";
import type { Invoice } from "./invoices-db";

function esc(s: string | undefined | null): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Částka s 2 desetinnými v cs-CZ ("12 345,50 Kč" / "1 234,00 EUR").
function fmtAmount(n: number, currency: string): string {
  const v = n.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "CZK" ? `${v} Kč` : `${v} ${currency}`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

// "2026-06" → "červen 2026" (předmět plnění v hlavičce).
function monthLabel(month: string): string {
  try {
    return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("cs-CZ", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return month;
  }
}

function partyBlock(
  title: string,
  p: { name: string; ico?: string; dic?: string; address?: string },
): string {
  const lines = [
    `<div class="party-name">${esc(p.name) || "-"}</div>`,
    p.address ? `<div>${esc(p.address)}</div>` : "",
    p.ico ? `<div>IČO: ${esc(p.ico)}</div>` : "",
    p.dic ? `<div>DIČ: ${esc(p.dic)}</div>` : "",
  ]
    .filter(Boolean)
    .join("");
  return `<div class="party"><div class="party-label">${esc(title)}</div>${lines}</div>`;
}

// Watermark NÁVRH - stejná technika jako u nefinálních smluv (fixed vrstva
// s otočenou dlaždicovou mřížkou, opakuje se na každé stránce), jen s vlastním
// textem. buildWatermarkHtml v pdf-styles není exportovaný a nese podpisový
// label, proto lokální varianta.
const DRAFT_WM_STYLES = `
.wm-layer { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 9999; }
.wm-grid {
  position: absolute; top: 50%; left: 50%;
  width: 185%; height: 185%;
  transform: translate(-50%, -50%) rotate(-30deg); transform-origin: center;
  display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: 130px;
  align-content: start;
}
.wm-cell {
  display: flex; align-items: center; justify-content: center;
  white-space: nowrap; color: rgba(14, 14, 14, 0.05);
  font-family: "Manrope", sans-serif; font-weight: 800; font-size: 17pt;
  letter-spacing: 0.08em;
}
`;

function draftWatermarkHtml(): string {
  const cells = `<div class="wm-cell">NÁVRH</div>`.repeat(5 * 16);
  return `<div class="wm-layer"><div class="wm-grid">${cells}</div></div>`;
}

const WORDMARK_HEIGHT = 13;
const WORDMARK_WIDTH = Math.round(WORDMARK_HEIGHT * WORDMARK_ASPECT);

const INVOICE_STYLES = `
.brand-row {
  display: flex; align-items: center; gap: 5pt;
  padding-bottom: 12pt; margin-bottom: 18pt;
  border-bottom: 0.5pt solid #E8ECE9;
}
.brand-row svg { width: 15px; height: 15px; }
.brand-row .doc-kind {
  margin-left: auto;
  font-size: 7.5pt; font-weight: 600; letter-spacing: 0.22em;
  text-transform: uppercase; color: #6F7672;
}

.inv-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24pt; }
.inv-head h1 { margin: 0 0 3pt 0; }
.inv-head .inv-sub { font-size: 10pt; color: #6F7672; margin: 0; }
.inv-meta { text-align: right; font-size: 9pt; color: #6F7672; flex-shrink: 0; }
.inv-meta table { border-collapse: collapse; margin-left: auto; }
.inv-meta td { padding: 1.5pt 0 1.5pt 14pt; }
.inv-meta td.v {
  font-family: "JetBrains Mono", monospace; font-size: 9.5pt;
  color: #0E0E0E; font-weight: 500; font-variant-numeric: tabular-nums;
  text-align: right;
}
.inv-meta td.v strong { font-weight: 700; }

.head-rule { border: 0; border-top: 1pt solid #0E0E0E; margin: 16pt 0 18pt 0; }

.parties { display: flex; gap: 32pt; margin: 0 0 24pt 0; }
.party { flex: 1; font-size: 9.5pt; line-height: 1.55; color: #2A2A2A; }
.party-label {
  font-size: 7pt; text-transform: uppercase; letter-spacing: 0.18em;
  color: #6F7672; margin-bottom: 5pt; font-weight: 600;
}
.party-name { font-weight: 700; font-size: 11pt; color: #0E0E0E; margin-bottom: 1pt; }

table.items { width: 100%; border-collapse: collapse; }
table.items th {
  text-align: left; font-size: 7pt; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.14em; color: #6F7672;
  padding: 6pt 8pt; background: #F2F3F1; border: none;
}
table.items th.num { text-align: right; }
table.items td {
  padding: 7pt 8pt; border-bottom: 0.5pt solid #E8ECE9;
  vertical-align: top; font-size: 9.5pt;
}
table.items td .item-label { font-weight: 600; color: #0E0E0E; }
table.items td .item-desc { font-size: 8pt; color: #6F7672; margin-top: 1pt; }
table.items td.num {
  text-align: right; white-space: nowrap;
  font-family: "JetBrains Mono", monospace; font-size: 9pt;
  font-variant-numeric: tabular-nums;
}

.totals-wrap { display: flex; justify-content: flex-end; margin-top: 14pt; page-break-inside: avoid; }
table.totals { border-collapse: collapse; min-width: 230pt; }
table.totals td { padding: 4pt 0; font-size: 9.5pt; color: #2A2A2A; }
table.totals td.num {
  text-align: right; white-space: nowrap;
  font-family: "JetBrains Mono", monospace; font-variant-numeric: tabular-nums;
  color: #0E0E0E;
}
table.totals tr.grand td {
  border-top: 1pt solid #0E0E0E; padding-top: 7pt;
  font-weight: 700; color: #0E0E0E; font-size: 11pt;
}
table.totals tr.grand td.num { font-size: 12pt; }

.pay-box {
  margin-top: 26pt; padding: 12pt 14pt;
  background: #FAFAF9; border: 0.5pt solid #E8ECE9; border-radius: 6pt;
  page-break-inside: avoid;
}
.pay-box .pay-title {
  font-size: 7pt; text-transform: uppercase; letter-spacing: 0.18em;
  color: #6F7672; font-weight: 600; margin-bottom: 7pt;
}
.pay-grid { display: flex; flex-wrap: wrap; gap: 6pt 36pt; }
.pay-grid .pay-item { font-size: 8pt; color: #6F7672; }
.pay-grid .pay-item .pv {
  display: block; font-family: "JetBrains Mono", monospace;
  font-size: 9.5pt; font-weight: 500; color: #0E0E0E; margin-top: 1pt;
  font-variant-numeric: tabular-nums;
}

.inv-note { margin-top: 20pt; font-size: 8pt; color: #6F7672; line-height: 1.5; }
.draft-note {
  margin-top: 14pt; padding: 8pt 12pt;
  border: 0.5pt solid #E8ECE9; border-radius: 6pt;
  font-size: 8.5pt; font-weight: 600; color: #B45309; background: #FFFBEB;
}
`;

export function buildInvoiceHtml(
  inv: Invoice,
  opts?: { draft?: boolean },
): string {
  const draft = opts?.draft ?? inv.status !== "approved";
  const period = monthLabel(inv.month);
  const title = draft
    ? "Faktura - návrh"
    : `Faktura ${esc(inv.number ?? "")}`;

  const metaRows = [
    ...(draft
      ? [
          `<tr><td>Číslo faktury</td><td class="v">přidělí se schválením</td></tr>`,
          `<tr><td>Variabilní symbol</td><td class="v">-</td></tr>`,
        ]
      : [
          `<tr><td>Datum vystavení</td><td class="v">${esc(fmtDate(inv.issuedDate))}</td></tr>`,
          `<tr><td>Datum splatnosti</td><td class="v"><strong>${esc(fmtDate(inv.dueDate))}</strong></td></tr>`,
        ]),
    `<tr><td>DUZP</td><td class="v">${esc(fmtDate(inv.dutyDate))}</td></tr>`,
    ...(draft
      ? []
      : [
          `<tr><td>Variabilní symbol</td><td class="v"><strong>${esc(inv.variableSymbol ?? "")}</strong></td></tr>`,
        ]),
  ].join("");

  const itemRows = inv.items
    .map(
      (i) => `<tr>
        <td>
          <div class="item-label">${esc(i.label)}</div>
          <div class="item-desc">${esc(i.description)}</div>
        </td>
        <td class="num">${esc(fmtAmount(i.amountBase, inv.currency))}</td>
      </tr>`,
    )
    .join("");

  const vatPct = Math.round(inv.totals.vatRate * 100);

  const body = `
    <div class="brand-row">
      ${HEADER_LOGO_SVG}
      <img src="data:image/png;base64,${WORDMARK_PNG_BASE64}" width="${WORDMARK_WIDTH}" height="${WORDMARK_HEIGHT}" alt="BOServices" style="display:block" />
      <span class="doc-kind">${draft ? "Návrh faktury" : "Faktura - daňový doklad"}</span>
    </div>

    <div class="inv-head">
      <div>
        <h1>${title}</h1>
        <p class="inv-sub">Poplatky dle smluv za období ${esc(period)}</p>
      </div>
      <div class="inv-meta"><table><tbody>${metaRows}</tbody></table></div>
    </div>

    <hr class="head-rule" />

    <div class="parties">
      ${partyBlock("Dodavatel", inv.supplier)}
      ${partyBlock("Odběratel", inv.customer)}
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Položka</th>
          <th class="num">Částka bez DPH</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="totals-wrap">
      <table class="totals">
        <tbody>
          <tr><td>Základ daně</td><td class="num">${esc(fmtAmount(inv.totals.base, inv.currency))}</td></tr>
          <tr><td>DPH ${vatPct} %</td><td class="num">${esc(fmtAmount(inv.totals.vat, inv.currency))}</td></tr>
          <tr class="grand"><td>Celkem k úhradě</td><td class="num">${esc(fmtAmount(inv.totals.total, inv.currency))}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="pay-box">
      <div class="pay-title">Platební údaje</div>
      <div class="pay-grid">
        <div class="pay-item">Bankovní účet<span class="pv">${esc(inv.supplier.bankAccount)}</span></div>
        <div class="pay-item">IBAN<span class="pv">${esc(inv.supplier.iban)}</span></div>
        <div class="pay-item">BIC / SWIFT<span class="pv">${esc(inv.supplier.bic)}</span></div>
        <div class="pay-item">Variabilní symbol<span class="pv">${draft ? "-" : esc(inv.variableSymbol ?? "")}</span></div>
      </div>
    </div>

    ${
      draft
        ? `<div class="draft-note">Návrh faktury - není daňovým dokladem. Číslo faktury, datum vystavení a splatnost se přidělí při schválení.</div>`
        : ""
    }

    <div class="inv-note">
      Dodavatel je plátcem DPH. Fakturováno dle smluv o poplatcích za období ${esc(period)}.
    </div>
  `;

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${PDF_PAGE_STYLES}
${INVOICE_STYLES}
${draft ? DRAFT_WM_STYLES : ""}
.__fontwarmup { position: absolute; top: -9999px; left: -9999px; visibility: hidden; }
</style>
</head>
<body>
${draft ? draftWatermarkHtml() : ""}
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:400">Mq</div>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:600">Mq</div>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:800">Mq</div>
<div class="__fontwarmup" style="font-family:'JetBrains Mono';font-weight:500">0123</div>
<div class="__fontwarmup" style="font-family:'JetBrains Mono';font-weight:700">0123</div>
${body}
</body>
</html>`;
}

export async function renderInvoicePdf(
  inv: Invoice,
  opts?: { draft?: boolean },
): Promise<Buffer> {
  return renderExportPdfBuffer(buildInvoiceHtml(inv, opts), {
    landscape: false,
    footerTemplate: FOOTER_TEMPLATE,
  });
}
