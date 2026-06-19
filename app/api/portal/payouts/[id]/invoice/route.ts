import { NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import { isAdminRole, requireSession } from "@/lib/portal/auth-guard";
import { salespersonByEmail } from "@/lib/portal/commissions";
import { getPayout, upsertPayout } from "@/lib/portal/payouts-db";
import { verifyInvoice } from "@/lib/portal/invoice-ai";
import { bustPayouts } from "@/lib/portal/revalidate";
import { notifyPayoutInvoice } from "@/lib/email";

// AI extrakce z PDF může chvíli trvat.
export const maxDuration = 60;

// Nahrání faktury obchodníkem. Soubor (PDF) přijde v multipart formData (limit
// serverless body ~4,5 MB; faktury jsou malé). AI ověří VS + částku; při skutečné
// neshodě 422 + smazání blobu. Při shodě / přeskočené AI → stav "fakturovano".
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const isAdmin = isAdminRole(g.session.user?.role);
  const me = salespersonByEmail(g.session.user!.email!);

  const { id } = await params;
  const payout = await getPayout(id);
  if (!payout) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (!isAdmin && me?.id !== payout.salespersonId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Chybí soubor faktury." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ ok: false, error: "Faktura musí být PDF." }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "Soubor je příliš velký (max 4 MB)." },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "-") || "faktura.pdf";
  const path = `portal/payouts/${id}/invoice/${Date.now()}-${safeName}`;

  let uploaded: { url: string; pathname: string };
  try {
    uploaded = await put(path, buffer, {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (err) {
    console.error("[payouts] invoice upload failed", err);
    return NextResponse.json({ ok: false, error: "Nahrání selhalo." }, { status: 500 });
  }

  const aiCheck = await verifyInvoice(buffer, {
    amount: payout.amount,
    variableSymbol: payout.variableSymbol,
    isVatPayer: payout.billing.isVatPayer,
  });

  // Skutečná neshoda (AI proběhla a nesedí) → odmítnout a uklidit blob.
  if (!aiCheck.ok) {
    try {
      await del(uploaded.pathname);
    } catch {
      /* best-effort */
    }
    return NextResponse.json(
      { ok: false, error: aiCheck.reasons.join(" "), aiCheck },
      { status: 422 },
    );
  }

  // Nahrazení staré faktury → smazat předchozí blob.
  if (payout.invoicePath && payout.invoicePath !== uploaded.pathname) {
    try {
      await del(payout.invoicePath);
    } catch {
      /* best-effort */
    }
  }

  const now = new Date().toISOString();
  await upsertPayout({
    ...payout,
    invoiceUrl: uploaded.url,
    invoicePath: uploaded.pathname,
    aiCheck,
    status: "fakturovano",
    updatedAt: now,
  });
  bustPayouts();

  const aiClean = aiCheck.ok && !aiCheck.skipped;
  notifyPayoutInvoice({
    merchantName: payout.merchantName,
    amount: payout.amount,
    variableSymbol: payout.variableSymbol,
    customerName: payout.customer.name,
    aiOk: aiClean,
    aiNote: aiClean ? undefined : aiCheck.reasons[0],
  }).catch((err) => console.error("[payouts] notify failed", err));

  return NextResponse.json({ ok: true, aiCheck });
}
