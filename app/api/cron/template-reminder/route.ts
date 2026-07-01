import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/portal/cron-auth";
import { sendReminderResponse } from "@/app/api/portal/templates/remind/route";

// Vercel Cron Job. vercel.json: "0 18 * * *" (denně 18:00 UTC).
// V CET (zima) = 19:00 Prague, v CEST (léto) = 20:00 Prague - protože
// většinu roku platí CEST, je tohle blíž k požadavku "ve 20:00 Prague".
//
// Vercel cron volání jsou autentizovaná hlavičkou Authorization: Bearer
// <CRON_SECRET>. Pokud je CRON_SECRET nastaven, vyžadujeme ho. Když není,
// running na local devu - skip auth (pro vývoj).

export async function GET(req: Request) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;
  // sendReminderResponse je shared helper z portal/templates/remind/route.ts.
  // Vrací stejný JSON jako manuální endpoint (sent: true/false + counts).
  return sendReminderResponse();
}
