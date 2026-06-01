import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireSession } from "@/lib/portal/auth-guard";
import { getLocation } from "@/lib/portal/locations-db";

// Autorizace client uploadu přílohy lokality (prohlížeč -> Vercel Blob napřímo,
// bez 4,5 MB limitu serverless funkce). Zaevidování do lokálních dat dělá POST
// /attachments (malé JSON tělo) po dokončení uploadu.
export const maxDuration = 60;

const ALLOWED = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

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
        const g = await requireSession();
        if (!g.ok) throw new Error("Neautorizováno.");
        const loc = await getLocation(id);
        if (!loc) throw new Error("Lokalita nenalezena.");
        if (!pathname.startsWith(`portal/locations/${id}/files/`)) {
          throw new Error("Neplatná cesta přílohy.");
        }
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: detail }, { status: 400 });
  }
}
