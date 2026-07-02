import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireSession } from "@/lib/portal/auth-guard";
import { getInvoice, upsertInvoice } from "@/lib/portal/invoices-db";
import { renderInvoicePdf } from "@/lib/portal/invoice-pdf";
import { renderAndStoreInvoicePdf } from "@/lib/portal/invoicing";

// On-demand render návrhu / backfill schválené faktury = puppeteer.
export const maxDuration = 60;

// PDF faktury. Návrh se renderuje on-demand s watermarkem NÁVRH (neukládá se);
// schválená faktura se streamuje z privátního Blobu - a když PDF při schválení
// nevzniklo (výpadek puppeteeru), doplní se tady ze snapshotu (backfill).
// Číst smí každý přihlášený (stejně jako stránku Fakturace).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    if (invoice.status === "draft") {
      const pdf = await renderInvoicePdf(invoice, { draft: true });
      return pdfResponse(pdf, `faktura-navrh-${invoice.month}.pdf`);
    }

    // Schváleno: stream z Blobu, případně backfill.
    let path = invoice.pdfPath;
    if (!path) {
      path = await renderAndStoreInvoicePdf(invoice);
      await upsertInvoice({ ...invoice, pdfPath: path });
    }
    const result = await get(path, { access: "private" });
    if (!result?.stream) {
      return NextResponse.json(
        { ok: false, error: "PDF nelze otevřít." },
        { status: 500 },
      );
    }
    return new Response(result.stream as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="faktura-${invoice.number ?? invoice.id}.pdf"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    console.error("[invoices] pdf failed", err);
    return NextResponse.json(
      { ok: false, error: "Generování PDF selhalo." },
      { status: 500 },
    );
  }
}

function pdfResponse(pdf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
