// Generování a schvalování faktur poplatků (sekce Finance → Fakturace).
//
// Generátor bere TYTÉŽ vstupy jako stránka Poplatky (buildFeeRows +
// computeMonthResults) za UZAVŘENÝ měsíc - tam jsou všechny částky "final"
// (z reálné tržby bez DPH), žádné odhady. Výsledek se snapshotuje do Invoice
// (Poplatky se počítají za běhu a měnily by se pod rukama). Návrhy jsou
// idempotentní upsert přes deterministické id; schválené faktury se NIKDY
// nepřepisují ani nemažou.
//
// Schválení přiděluje číslo z nepřerušené roční řady, razítkuje data
// (vystaveno = dnes, splatnost +14 dní) a best-effort vygeneruje PDF do Blobu
// (selhání PDF schválení neshodí - download routa umí backfill ze snapshotu).

import { put } from "@vercel/blob";
import { listContracts } from "./contracts-db";
import { listClients, type Client } from "./clients-db";
import {
  buildFeeRows,
  computeMonthResults,
  isRowActiveInMonth,
  monthKeyOf,
  FEES_MIN_MONTH,
  type FeeRow,
  type FeeMonthResult,
} from "./fees-page";
import {
  acquireApproveLock,
  deleteInvoice,
  getInvoice,
  getNextInvoiceNumber,
  invoiceIdFor,
  listInvoicesByMonth,
  releaseApproveLock,
  upsertInvoice,
  INVOICE_SUPPLIER,
  INVOICE_VAT_RATE,
  type Invoice,
  type InvoiceCustomer,
  type InvoiceItem,
} from "./invoices-db";

// Chyba s HTTP statusem pro API vrstvu (400 validace, 409 konflikt,
// 422 neúplné podklady, 503 nedostupné DW).
export class InvoicingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface GenerateResult {
  month: string;
  drafts: number; // vytvořené/přepočtené návrhy
  skippedApproved: number; // (klient, měna) už schváleno → nedotčeno
  removedStale: number; // uklizené osiřelé návrhy
  warnings: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Poslední den měsíce "YYYY-MM" → "YYYY-MM-DD" (DUZP).
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map((s) => parseInt(s, 10));
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function fmtCzShortDate(iso: string): string {
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

// Adresa odběratele jako jeden řádek ("Ulice 1, 110 00 Praha").
function customerAddress(c: Client): string {
  const a = c.address;
  const cityPart = [a.zip, a.city].filter(Boolean).join(" ");
  const parts = [a.street, cityPart].filter(Boolean);
  const country = a.country?.trim();
  if (country && country.toLowerCase() !== "česká republika" && country !== "CZ") {
    parts.push(country);
  }
  return parts.join(", ");
}

// Popis položky: lokalita · smlouva · sazba · fakturované období.
function itemDescription(row: FeeRow, res: FeeMonthResult): string {
  const parts = [row.locationName, row.contractLabel];
  if (row.rate) parts.push(row.rate);
  if (res.billedFrom && res.billedTo) {
    const range = `${fmtCzShortDate(res.billedFrom)}-${fmtCzShortDate(res.billedTo)}`;
    parts.push(
      res.billedDays ? `${range} (${res.billedDays} dnů)` : range,
    );
  }
  return parts.join(" · ");
}

export async function generateInvoiceDrafts(
  month: string,
  by: string,
  source: "cron" | "manual",
): Promise<GenerateResult> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new InvoicingError("Neplatný měsíc (očekávám YYYY-MM).");
  }
  if (month < FEES_MIN_MONTH) {
    throw new InvoicingError(
      `Poplatky se fakturují až od ${FEES_MIN_MONTH}.`,
    );
  }
  const currentMonth = monthKeyOf(new Date());
  if (month >= currentMonth) {
    throw new InvoicingError(
      "Fakturovat lze jen uzavřené měsíce (za probíhající měsíc až po jeho konci).",
    );
  }

  const contracts = await listContracts();
  const rows = buildFeeRows(contracts).filter((r) =>
    isRowActiveInMonth(r, month),
  );
  const results = await computeMonthResults(rows, month, new Date());

  // Ochrana proti výpadku DW: při pádu párovacího indexu vrací
  // computeMonthResults všem řádkům {status:"none"} bez reason; při nedostupných
  // tržbách (výpadek API / chybějící POS_API_KEY) skončí VŠECHNY aktivní řádky
  // jako "no-revenue". Uzavřený měsíc, kdy ŽÁDNÁ lokalita neměla tržbu, v praxi
  // neexistuje → v obou případech radši selhat, než vygenerovat prázdno a
  // v úklidu smazat existující návrhy.
  if (rows.length > 0) {
    const allNone = rows.every(
      (r) => results.get(r.key)?.status === "none",
    );
    if (allNone) {
      throw new InvoicingError(
        "Tržby z datového skladu nejsou dostupné - zkuste to za chvíli.",
        503,
      );
    }
  }

  // Fakturovatelné buňky → skupiny (klient, měna). Uzavřený měsíc = jen final.
  const groups = new Map<
    string,
    { clientId: string; clientName: string; currency: string; items: InvoiceItem[] }
  >();
  for (const row of rows) {
    const res = results.get(row.key);
    if (!res || res.status !== "final" || res.amount == null || res.amount <= 0) {
      continue;
    }
    const id = invoiceIdFor(month, row.clientId, res.currency);
    let g = groups.get(id);
    if (!g) {
      g = {
        clientId: row.clientId,
        clientName: row.clientName,
        currency: res.currency,
        items: [],
      };
      groups.set(id, g);
    }
    g.items.push({
      label: row.periodLabel,
      description: itemDescription(row, res),
      contractId: row.contractId,
      contractType: row.contractType,
      periodId: row.periodId,
      locationId: row.locationId,
      locationName: row.locationName,
      amountBase: round2(res.amount),
    });
  }

  const clients = await listClients();
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const now = new Date().toISOString();
  const dutyDate = lastDayOfMonth(month);
  const result: GenerateResult = {
    month,
    drafts: 0,
    skippedApproved: 0,
    removedStale: 0,
    warnings: [],
  };

  for (const [id, g] of groups) {
    const existing = await getInvoice(id);
    if (existing?.status === "approved") {
      result.skippedApproved++;
      continue;
    }

    const client = clientById.get(g.clientId);
    const warnings: string[] = [];
    let customer: InvoiceCustomer;
    if (client) {
      customer = {
        name: client.companyName,
        ico: client.ico || undefined,
        dic: client.dic || undefined,
        address: customerAddress(client) || undefined,
        email: client.contact?.email || undefined,
      };
      if (!client.ico) warnings.push("Klient nemá vyplněné IČO.");
      if (!customer.address) warnings.push("Klient nemá vyplněnou adresu.");
    } else {
      customer = { name: g.clientName };
      warnings.push(
        "Klient nebyl nalezen v Klientech - doplňte ho a přegenerujte návrhy.",
      );
    }

    g.items.sort((a, b) => {
      const c = a.locationName.localeCompare(b.locationName, "cs");
      return c !== 0 ? c : a.label.localeCompare(b.label, "cs");
    });
    const base = round2(g.items.reduce((s, i) => s + i.amountBase, 0));
    const vat = round2(base * INVOICE_VAT_RATE);
    const total = round2(base + vat);

    await upsertInvoice({
      id,
      month,
      clientId: g.clientId,
      customer,
      supplier: INVOICE_SUPPLIER,
      currency: g.currency,
      items: g.items,
      totals: { base, vat, total, vatRate: INVOICE_VAT_RATE },
      status: "draft",
      dutyDate,
      warnings: warnings.length ? warnings : undefined,
      generatedAt: now,
      generatedBy: by,
      source,
    });
    result.drafts++;
    for (const w of warnings) {
      result.warnings.push(`${customer.name}: ${w}`);
    }
  }

  // Úklid: návrhy měsíce, které už nemají podklad v Poplatcích (klient/perioda
  // mezitím vypadly). Schválených se úklid nedotýká.
  const monthInvoices = await listInvoicesByMonth(month);
  for (const inv of monthInvoices) {
    if (inv.status === "draft" && !groups.has(inv.id)) {
      await deleteInvoice(inv.id);
      result.removedStale++;
    }
  }

  return result;
}

// Schválení návrhu → daňový doklad: číslo z roční řady, datumy, PDF do Blobu.
// Idempotentní: už schválená faktura se vrátí beze změny (already=true).
export async function approveInvoice(
  id: string,
  email: string,
): Promise<{ invoice: Invoice; already?: boolean }> {
  const inv = await getInvoice(id);
  if (!inv) throw new InvoicingError("Faktura nenalezena.", 404);
  if (inv.status === "approved") return { invoice: inv, already: true };

  if (!inv.customer.name || !inv.customer.address) {
    throw new InvoicingError(
      "Fakturu nelze schválit - odběrateli chybí název nebo adresa. Doplňte klienta a přegenerujte návrhy.",
      422,
    );
  }

  if (!(await acquireApproveLock(id))) {
    throw new InvoicingError("Faktura se právě schvaluje - zkuste to za chvíli.", 409);
  }
  try {
    // Re-check pod zámkem (mezi getInvoice a zámkem mohl schválit někdo jiný).
    const fresh = await getInvoice(id);
    if (!fresh) throw new InvoicingError("Faktura nenalezena.", 404);
    if (fresh.status === "approved") return { invoice: fresh, already: true };

    const now = new Date();
    const number = await getNextInvoiceNumber(now);
    const issuedDate = isoDate(now);
    const approved: Invoice = {
      ...fresh,
      status: "approved",
      number,
      variableSymbol: number,
      issuedDate,
      dueDate: addDays(issuedDate, 14),
      approvedAt: now.toISOString(),
      approvedBy: email,
    };

    // PDF best-effort: schválení nesmí spadnout kvůli puppeteeru - snapshot
    // je kompletní a PDF routa umí backfill.
    try {
      approved.pdfPath = await renderAndStoreInvoicePdf(approved);
    } catch (err) {
      console.error("[invoices] PDF render při schválení selhal", err);
    }

    await upsertInvoice(approved);
    return { invoice: approved };
  } finally {
    await releaseApproveLock(id);
  }
}

// Render + upload PDF schválené faktury do privátního Blobu. Vrací path.
export async function renderAndStoreInvoicePdf(inv: Invoice): Promise<string> {
  const { renderInvoicePdf } = await import("./invoice-pdf");
  const pdf = await renderInvoicePdf(inv, { draft: false });
  const path = `portal/invoices/${inv.id}/faktura-${inv.number ?? inv.id}.pdf`;
  const uploaded = await put(path, pdf, {
    access: "private",
    contentType: "application/pdf",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return uploaded.pathname;
}
