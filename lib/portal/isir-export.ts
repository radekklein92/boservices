// PDF export postoupených pohledávek jako podklad pro přihlášky do insolvence
// (ISIR). Členěno PO DLUŽNÍKOVI (každá firma na nové stránce), pod ní všechny
// pohledávky uplatnitelné v jejím insolvenčním řízení (přímé postoupené +
// z ručení + ruční). Agregace PŘESNĚ zrcadlí buildAssignedClaimsView, takže
// grandTotal === headline modalu (invariant SUM(group.total) === grandTotal).
//
// Věřitel (postupník) se LIŠÍ podle pohledávky (různé subjekty CEIPu), proto je
// uveden jako sloupec u každé pohledávky (z providerName dané smlouvy), ne jako
// jeden globální údaj.

import type { Contract } from "./contracts-db";
import type { MirroredClamoraContract } from "./clamora-claims-db";
import { parseClaimAmount, formatCzk } from "./claims";
import {
  confirmedGuarantors,
  dedupeByCompany,
  type ClaimsOverlay,
} from "./claims-overlay";
import { titleForClaimItem, originDisplay } from "./assigned-claims";
import { DEBTOR_PRESETS } from "./debtor-presets";
import { PDF_PAGE_STYLES } from "./pdf-styles";

const UNNAMED_DEBTOR = "Neuvedený dlužník";

export interface IsirExportRow {
  source: "postoupení" | "ruční" | "Clamora"; // původ pohledávky (Clamora = zrcadlené z ClamoraPortal)
  role: "dlužník" | "ručitel"; // postavení u TÉTO firmy
  amount: number; // vč. DPH (plná částka i u ručitele)
  title: string; // právní titul / název ruční pohledávky
  primaryDebtor: string;
  creditor?: string; // věřitel / postupník (providerName smlouvy); ruční = ―
  client?: string; // postupitel (jen smluvní)
  contractNumber?: string;
  contractDate?: string;
  originLabel?: string; // "Kupní smlouva ze dne …"
  invoiceNumber?: string;
  dueDate?: string;
  note?: string;
  claimKey: string;
}

export interface IsirExportGroup {
  company: string;
  debtorIco?: string;
  total: number;
  rows: IsirExportRow[];
}

export interface IsirExportData {
  groups: IsirExportGroup[];
  grandTotal: number;
  groupsCount: number;
  rowsCount: number;
}

function resolveIco(
  company: string,
  icoByCompany: Map<string, string>,
): string | undefined {
  const fromContract = icoByCompany.get(company);
  if (fromContract) return fromContract;
  const key = company.trim().toLowerCase();
  const preset = DEBTOR_PRESETS.find((p) => p.label.trim().toLowerCase() === key);
  return preset?.ico;
}

export function buildIsirExportData(
  contracts: Contract[],
  overlay: ClaimsOverlay,
  clamoraContracts: MirroredClamoraContract[] = [],
): IsirExportData {
  const groupMap = new Map<string, IsirExportGroup>();
  const icoByCompany = new Map<string, string>();
  let grandTotal = 0;
  let rowsCount = 0;

  function ensure(name: string): IsirExportGroup {
    let grp = groupMap.get(name);
    if (!grp) {
      grp = { company: name, total: 0, rows: [] };
      groupMap.set(name, grp);
    }
    return grp;
  }

  // Jediná cesta měnící group.total i grandTotal -> drží invariant.
  function add(
    rawName: string,
    role: IsirExportRow["role"],
    row: Omit<IsirExportRow, "role">,
  ): void {
    const name = rawName.trim() || UNNAMED_DEBTOR;
    const grp = ensure(name);
    grp.total += row.amount;
    grandTotal += row.amount;
    rowsCount++;
    grp.rows.push({ ...row, role });
  }

  // 1) Smluvní pohledávky (stejný gate jako buildAssignedClaimsView).
  for (const c of contracts) {
    if (c.type !== "claim-bundle") continue;
    if (c.cancelledAt) continue; // zrušená smlouva se nepočítá nikam
    if (!(c.clientSignedAt || c.signedAt || c.scanUploadedAt)) continue;
    const debtor = c.variables?.debtorName?.trim() || UNNAMED_DEBTOR;
    const ico = c.variables?.debtorIco?.trim();
    if (ico && !icoByCompany.has(debtor)) icoByCompany.set(debtor, ico);
    const claims = c.claims ?? [];
    for (let index = 0; index < claims.length; index++) {
      const item = claims[index]!;
      const amt = parseClaimAmount(item.amount);
      if (amt <= 0) continue;
      const claimKey = item.id || `${c.id}#${index}`;
      const base: Omit<IsirExportRow, "role"> = {
        source: "postoupení",
        amount: amt,
        title: titleForClaimItem(item),
        primaryDebtor: debtor,
        creditor: c.variables?.providerName?.trim() || undefined,
        client: c.clientName?.trim() || undefined,
        contractNumber: c.number?.trim() || undefined,
        contractDate: c.variables?.contractDate?.trim() || undefined,
        originLabel: originDisplay(item),
        invoiceNumber: item.invoiceNumber?.trim() || undefined,
        dueDate: item.dueDate?.trim() || undefined,
        note: item.note?.trim() || undefined,
        claimKey,
      };
      add(debtor, "dlužník", base);
      const confGs = dedupeByCompany(
        confirmedGuarantors(overlay.guaranteesByClaimId[claimKey]),
      );
      for (const gtor of confGs) {
        const gName = gtor.company.trim();
        if (!gName || gName === debtor) continue;
        add(gName, "ručitel", base);
      }
    }
  }

  // 1b) Zrcadlené pohledávky z ClamoraPortal (podepsané klientem). Věřitel
  // (postupník) = creditorName ze zrcadlené smlouvy (Clamora Bridge s.r.o.).
  // claimKey s prefixem „clamora:" je shodný s agregací -> cross-ručení sedí.
  for (const c of clamoraContracts) {
    const debtor = c.debtorName?.trim() || UNNAMED_DEBTOR;
    const ico = c.debtorIco?.trim();
    if (ico && !icoByCompany.has(debtor)) icoByCompany.set(debtor, ico);
    const items = c.items ?? [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!;
      const amt = parseClaimAmount(item.amount);
      if (amt <= 0) continue;
      const claimKey = `clamora:${c.contractId}#${item.id || index}`;
      const base: Omit<IsirExportRow, "role"> = {
        source: "Clamora",
        amount: amt,
        title: titleForClaimItem(item),
        primaryDebtor: debtor,
        creditor: c.creditorName?.trim() || undefined,
        client: c.clientName?.trim() || undefined,
        contractNumber: c.contractNumber?.trim() || undefined,
        contractDate: c.contractDate?.trim() || undefined,
        originLabel: originDisplay(item),
        invoiceNumber: item.invoiceNumber?.trim() || undefined,
        dueDate: item.dueDate?.trim() || undefined,
        note: item.note?.trim() || undefined,
        claimKey,
      };
      add(debtor, "dlužník", base);
      const confGs = dedupeByCompany(
        confirmedGuarantors(overlay.guaranteesByClaimId[claimKey]),
      );
      for (const gtor of confGs) {
        const gName = gtor.company.trim();
        if (!gName || gName === debtor) continue;
        add(gName, "ručitel", base);
      }
    }
  }

  // 2) Ruční pohledávky z overlay.
  for (const m of overlay.manualClaims) {
    const amt = parseClaimAmount(m.amount);
    if (amt <= 0 || !m.name.trim()) continue;
    const primary = m.primaryDebtor.trim() || UNNAMED_DEBTOR;
    const base: Omit<IsirExportRow, "role"> = {
      source: "ruční",
      amount: amt,
      title: m.name.trim(),
      primaryDebtor: primary,
      note: m.note?.trim() || undefined,
      claimKey: m.id,
    };
    add(primary, "dlužník", base);
    const confGs = dedupeByCompany(confirmedGuarantors(m.guarantors));
    for (const gtor of confGs) {
      const gName = gtor.company.trim();
      if (!gName || gName === primary) continue;
      add(gName, "ručitel", base);
    }
  }

  const roleRank = (r: IsirExportRow["role"]) => (r === "dlužník" ? 0 : 1);
  for (const grp of groupMap.values()) {
    grp.debtorIco = resolveIco(grp.company, icoByCompany);
    grp.rows.sort(
      (a, b) => roleRank(a.role) - roleRank(b.role) || b.amount - a.amount,
    );
  }
  const groups = [...groupMap.values()].sort((a, b) => b.total - a.total);

  if (process.env.NODE_ENV !== "production") {
    const sum = groups.reduce((s, grp) => s + grp.total, 0);
    console.assert(
      Math.abs(sum - grandTotal) < 0.005,
      "ISIR export: SUM(group.total) != grandTotal",
      sum,
      grandTotal,
    );
  }

  return {
    groups,
    grandTotal,
    groupsCount: groups.length,
    rowsCount,
  };
}

// ─────────────────────────────────────────────────────────────────────
// HTML dokument pro PDF
// ─────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const companiesWord = (n: number) =>
  n === 1 ? "firma" : n < 5 ? "firmy" : "firem";
const rowsWord = (n: number) =>
  n === 1 ? "pohledávka" : n < 5 ? "pohledávky" : "pohledávek";

const ISIR_EXPORT_STYLES = `
  .isir-cover-meta { font-size: 9.5pt; line-height: 1.7; margin: 0 0 4pt 0; }
  .isir-cover-meta strong { font-weight: 700; }
  .isir-group { break-before: page; page-break-before: always; }
  .isir-group:first-of-type { break-before: auto; page-break-before: auto; }
  .isir-group-head { margin: 0 0 6pt 0; }
  .isir-group-head h2 { border: none; padding: 0; margin: 0 0 2pt 0; font-size: 14pt; }
  .isir-group-meta { font-size: 9pt; color: #6F7672; margin: 0; }
  table.isir { font-size: 7.5pt; table-layout: fixed; width: 100%; margin: 6pt 0; }
  table.isir th, table.isir td {
    padding: 3pt 4pt; word-break: break-word; overflow-wrap: anywhere; vertical-align: top;
  }
  table.isir thead { display: table-header-group; }
  table.isir tr { break-inside: avoid; page-break-inside: avoid; }
  .isir-amount { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .isir-check {
    display: inline-block; width: 11pt; height: 11pt;
    border: 1pt solid #0E0E0E; border-radius: 2pt;
  }
  .isir-role-debtor { font-weight: 700; }
  .isir-tfoot td { font-weight: 700; background: #F2F3F1; }
`;

// 12 sloupců (po doplnění Věřitel). Šířky v % (součet 100).
const ISIR_COLGROUP =
  '<col style="width:4%"><col style="width:5%"><col style="width:6%">' +
  '<col style="width:11%"><col style="width:11%"><col style="width:19%">' +
  '<col style="width:12%"><col style="width:6%"><col style="width:6%">' +
  '<col style="width:8%"><col style="width:7%"><col style="width:5%">';

const ISIR_HEAD =
  "<th>Přihl. ISIR</th><th>Zdroj</th><th>Postavení</th>" +
  "<th>Věřitel (postupník)</th><th>Klient (postupitel)</th><th>Právní titul</th>" +
  "<th>Vznikla ze smlouvy</th><th>Č. faktury</th><th>Splatnost</th>" +
  '<th>Smlouva</th><th class="isir-amount">Výše vč. DPH</th><th>Poznámka</th>';

function renderRow(r: IsirExportRow): string {
  const cell = (v?: string) => (v && v.trim() ? esc(v) : "—");
  const smlouva =
    [r.contractNumber, r.contractDate]
      .filter((x): x is string => !!x && !!x.trim())
      .map(esc)
      .join(" · ") || "—";
  const roleClass = r.role === "dlužník" ? "isir-role-debtor" : "";
  return (
    "<tr>" +
    '<td style="text-align:center"><span class="isir-check" aria-hidden="true"></span></td>' +
    `<td>${esc(r.source)}</td>` +
    `<td><span class="${roleClass}">${esc(r.role)}</span></td>` +
    `<td>${cell(r.creditor)}</td>` +
    `<td>${cell(r.client)}</td>` +
    `<td>${cell(r.title)}</td>` +
    `<td>${cell(r.originLabel)}</td>` +
    `<td>${cell(r.invoiceNumber)}</td>` +
    `<td>${cell(r.dueDate)}</td>` +
    `<td>${smlouva}</td>` +
    `<td class="isir-amount">${esc(formatCzk(r.amount))}</td>` +
    `<td>${cell(r.note)}</td>` +
    "</tr>"
  );
}

function renderGroup(g: IsirExportGroup): string {
  const meta =
    `IČO: ${g.debtorIco ? esc(g.debtorIco) : "neuvedeno"} · ` +
    `celkem ${esc(formatCzk(g.total))} vč. DPH · ` +
    `${g.rows.length} ${rowsWord(g.rows.length)}`;
  const rows = g.rows.map(renderRow).join("");
  return `<section class="isir-group">
  <div class="isir-group-head">
    <h2>${esc(g.company)}</h2>
    <p class="isir-group-meta">${meta}</p>
  </div>
  <table class="isir">
    <colgroup>${ISIR_COLGROUP}</colgroup>
    <thead><tr>${ISIR_HEAD}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="isir-tfoot"><td colspan="10">Celkem za ${esc(g.company)}</td><td class="isir-amount">${esc(formatCzk(g.total))}</td><td></td></tr></tfoot>
  </table>
</section>`;
}

function renderCover(data: IsirExportData, generatedAt: Date): string {
  const dateStr = generatedAt.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const index = data.groups
    .map(
      (g) =>
        `<li>${esc(g.company)} — <strong>${esc(formatCzk(g.total))}</strong></li>`,
    )
    .join("");
  return `<div class="first-page-header">
  <p class="eyebrow">Postoupené pohledávky · podklad pro insolvenční řízení</p>
  <h1 class="first-page-title">Přehled pohledávek k přihlášení do insolvence</h1>
  <p class="first-page-subtitle">Členěno po dlužníkovi (insolvenčním řízení). Každá firma je na samostatné straně.</p>
</div>
<p class="isir-cover-meta"><strong>Datum sestavení:</strong> ${esc(dateStr)}</p>
<p class="isir-cover-meta"><strong>Celkem uplatnitelné:</strong> ${esc(formatCzk(data.grandTotal))} vč. DPH · ${data.groupsCount} ${companiesWord(data.groupsCount)} · ${data.rowsCount} ${rowsWord(data.rowsCount)}</p>
<h2>Přehled dlužníků</h2>
<ol>${index}</ol>
<p class="isir-cover-meta" style="color:#6F7672;font-style:italic;">Pozn.: Věřitel (postupník) se u jednotlivých pohledávek liší - je uveden ve sloupci „Věřitel (postupník)". Jedna pohledávka se uplatňuje v plné výši u dlužníka i u každého potvrzeného ručitele (sloupec „Postavení"). Sloupec „Přihl. ISIR" je k ručnímu odškrtnutí po podání přihlášky.</p>`;
}

export function buildIsirExportDocument(
  data: IsirExportData,
  opts: { generatedAt: Date },
): string {
  const body =
    renderCover(data, opts.generatedAt) +
    data.groups.map(renderGroup).join("\n");
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${PDF_PAGE_STYLES}
${ISIR_EXPORT_STYLES}
.__fontwarmup { position: absolute; top: -9999px; left: -9999px; visibility: hidden; }
</style>
</head>
<body>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:400">Mq</div>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:600">Mq</div>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:700">Mq</div>
<div class="__fontwarmup" style="font-family:'Manrope';font-weight:800">Mq</div>
${body}
</body>
</html>`;
}
