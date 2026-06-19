// Podklad pro fakturaci provize (PDF). Slouží obchodníkovi jako šablona faktury:
// dodavatel (on / jeho firma), odběratel (plátce provize), položka, částka
// (plátce DPH → základ + 21 %), variabilní symbol a číslo účtu. Render přes
// sdílený renderExportPdfBuffer (portrait), styly z PDF_PAGE_STYLES.

import { formatCzk } from "./claims";
import { PDF_PAGE_STYLES } from "./pdf-styles";
import { renderExportPdfBuffer } from "./pdf-generator";
import type { Payout } from "./payouts-db";

const VAT_RATE = 0.21;

function esc(s: string | undefined | null): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function partyBlock(
  title: string,
  p: { name: string; ico?: string; dic?: string; address?: string },
): string {
  const lines = [
    `<div class="party-name">${esc(p.name) || "—"}</div>`,
    p.address ? `<div>${esc(p.address)}</div>` : "",
    p.ico ? `<div>IČO: ${esc(p.ico)}</div>` : "",
    p.dic ? `<div>DIČ: ${esc(p.dic)}</div>` : "",
  ]
    .filter(Boolean)
    .join("");
  return `<div class="party"><div class="party-label">${esc(title)}</div>${lines}</div>`;
}

const EXTRA_STYLES = `
.payout-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:28px; }
.payout-meta { text-align:right; font-size:12px; color:#6F7672; }
.payout-meta .vs { font-family:"JetBrains Mono", monospace; font-size:15px; font-weight:700; color:#0E0E0E; }
.parties { display:flex; gap:32px; margin:8px 0 28px; }
.party { flex:1; font-size:12.5px; line-height:1.5; }
.party-label { font-size:9.5px; text-transform:uppercase; letter-spacing:.16em; color:#6F7672; margin-bottom:6px; }
.party-name { font-weight:700; font-size:14px; }
.amount-table td { padding:6px 0; }
.bank { margin-top:24px; font-size:12.5px; }
.bank .vs2 { font-family:"JetBrains Mono", monospace; font-weight:700; }
.note { margin-top:28px; font-size:11px; color:#6F7672; }
`;

export function buildPayoutPodkladHtml(p: Payout): string {
  const base = Math.round(p.amount);
  const vat = p.billing.isVatPayer ? Math.round(p.amount * VAT_RATE) : 0;
  const total = base + vat;
  const date = (() => {
    try {
      return new Date(p.createdAt).toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "";
    }
  })();

  const amountRows = p.billing.isVatPayer
    ? `<tr><td>Základ daně</td><td style="text-align:right">${esc(formatCzk(base))}</td></tr>
       <tr><td>DPH 21 %</td><td style="text-align:right">${esc(formatCzk(vat))}</td></tr>
       <tr><td style="font-weight:700;border-top:1px solid #E8ECE9">Celkem k úhradě</td><td style="text-align:right;font-weight:700;border-top:1px solid #E8ECE9">${esc(formatCzk(total))}</td></tr>`
    : `<tr><td style="font-weight:700">Celkem k úhradě</td><td style="text-align:right;font-weight:700">${esc(formatCzk(total))}</td></tr>
       <tr><td colspan="2" style="color:#6F7672;font-size:11px">Dodavatel není plátce DPH.</td></tr>`;

  const body = `
    <div class="payout-head">
      <div>
        <h1 style="margin:0">Podklad pro fakturaci provize</h1>
        <div style="color:#6F7672;font-size:12.5px;margin-top:4px">Provize za zprostředkování · BOServices</div>
      </div>
      <div class="payout-meta">
        <div>Variabilní symbol</div>
        <div class="vs">${esc(p.variableSymbol)}</div>
        ${date ? `<div style="margin-top:8px">Datum: ${esc(date)}</div>` : ""}
      </div>
    </div>

    <div class="parties">
      ${partyBlock("Dodavatel", p.billing)}
      ${partyBlock("Odběratel", p.customer)}
    </div>

    <table>
      <thead><tr><th>Položka</th><th style="text-align:right">Částka</th></tr></thead>
      <tbody>
        <tr><td>Provize za zprostředkování franšízingových smluv a postoupení pohledávek</td><td style="text-align:right;white-space:nowrap">${esc(formatCzk(base))}</td></tr>
      </tbody>
    </table>

    <table class="amount-table" style="margin-top:20px;max-width:320px;margin-left:auto">
      <tbody>${amountRows}</tbody>
    </table>

    <div class="bank">
      Variabilní symbol: <span class="vs2">${esc(p.variableSymbol)}</span><br>
      ${p.billing.bankAccount ? `Číslo účtu: ${esc(p.billing.bankAccount)}` : "Číslo účtu: ______________________"}
    </div>

    <div class="note">
      Tento podklad slouží jako vzor pro vystavení faktury obchodníkem. Skutečnou
      fakturu nahrajte v portálu (Provize → Spravovat). Částky jsou v Kč.
    </div>
  `;

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>${PDF_PAGE_STYLES}
${EXTRA_STYLES}
.__fontwarmup { position: absolute; top: -9999px; left: -9999px; visibility: hidden; }
</style>
</head>
<body>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:400">Mq</div>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:700">Mq</div>
<div class="__fontwarmup" style="font-family:'JetBrains Mono';font-weight:700">Mq</div>
${body}
</body>
</html>`;
}

export async function renderPayoutPodkladPdf(p: Payout): Promise<Buffer> {
  return renderExportPdfBuffer(buildPayoutPodkladHtml(p), { landscape: false });
}
