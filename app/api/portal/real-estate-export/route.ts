import { requireSession } from "@/lib/portal/auth-guard";
import { buildRealEstateMasterXlsx } from "@/lib/portal/real-estate-master-export";

// Server-side „master" export Real Estate do .xlsx (tlačítko Excel na stránce
// Real Estate). Tabulka ve formátu NewCo importu + všechny doplňkové systémové
// sloupce (smlouvy, klient, Transition metadata). Smí každý přihlášený.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const bytes = await buildRealEstateMasterXlsx();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (ASCII)
  // Kopie nad plain ArrayBuffer - jszip typuje výstup jako Uint8Array<ArrayBufferLike>,
  // což BodyInit (BufferSource = Uint8Array<ArrayBuffer>) jinak nepřijme.
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="real-estate-${today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
