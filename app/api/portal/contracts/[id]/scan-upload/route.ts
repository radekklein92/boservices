import { NextResponse } from "next/server";
import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { requireSession } from "@/lib/portal/auth-guard";
import { getContract, locationRequiredError } from "@/lib/portal/contracts-db";

// Autorizace client uploadu skenu (prohlížeč -> Vercel Blob napřímo, bez 4,5 MB
// limitu serverless funkce). Vrací podepsaný client token. Samotné zaevidování
// skenu na smlouvu dělá POST /scan (malé JSON tělo) po dokončení uploadu.
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Autorizace probíhá zde (token-gen request z prohlížeče).
        const g = await requireSession();
        if (!g.ok) throw new Error("Neautorizováno.");
        const contract = await getContract(id);
        if (!contract) throw new Error("Smlouva nenalezena.");
        const locErr = locationRequiredError(contract);
        if (locErr) throw new Error(locErr);
        // Cesta musí patřit této smlouvě - klient si nemůže zvolit cizí prefix.
        if (!pathname.startsWith(`portal/contracts/${id}/scans/`)) {
          throw new Error("Neplatná cesta skenu.");
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: true,
        };
      },
      // onUploadCompleted nepoužíváme - sken eviduje klient přes POST /scan
      // hned po dokončení uploadu (spolehlivější než webhook, funguje i lokálně).
    });
    return NextResponse.json(json);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: detail }, { status: 400 });
  }
}
