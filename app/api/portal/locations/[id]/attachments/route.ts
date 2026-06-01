import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { del } from "@vercel/blob";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustLocations } from "@/lib/portal/revalidate";
import {
  getLocation,
  getLocationLocal,
  saveLocationLocal,
  type LocationAttachment,
  type LocationLocal,
} from "@/lib/portal/locations-db";

// Evidence (POST) a smazání (DELETE) příloh lokality. Samotný binární upload jde
// přímo z prohlížeče do Blobu přes /attachments/upload; sem chodí jen metadata.

const registerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().url(),
  pathname: z.string().min(1),
  size: z.number().int().min(0),
  contentType: z.string().min(1).max(120),
});

function emptyLocal(id: string, email: string): LocationLocal {
  return {
    locationId: id,
    note: "",
    attachments: [],
    updatedBy: email,
    updatedAt: new Date().toISOString(),
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const loc = await getLocation(id);
  if (!loc) {
    return NextResponse.json({ ok: false, error: "Lokalita nenalezena" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed" }, { status: 400 });
  }

  const email = g.session.user!.email!;
  const local = (await getLocationLocal(id)) ?? emptyLocal(id, email);
  const attachment: LocationAttachment = {
    id: nanoid(10),
    name: parsed.data.name,
    url: parsed.data.url,
    pathname: parsed.data.pathname,
    size: parsed.data.size,
    contentType: parsed.data.contentType,
    uploadedBy: email,
    uploadedAt: new Date().toISOString(),
  };
  local.attachments = [...local.attachments, attachment];
  local.updatedBy = email;
  local.updatedAt = attachment.uploadedAt;
  await saveLocationLocal(local);
  bustLocations();

  return NextResponse.json({ ok: true, attachment });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const attachmentId = new URL(req.url).searchParams.get("attachmentId");
  if (!attachmentId) {
    return NextResponse.json({ ok: false, error: "Chybí attachmentId" }, { status: 400 });
  }

  const local = await getLocationLocal(id);
  if (!local) {
    return NextResponse.json({ ok: false, error: "Lokalita nemá přílohy" }, { status: 404 });
  }
  const target = local.attachments.find((a) => a.id === attachmentId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "Příloha nenalezena" }, { status: 404 });
  }

  // Smazat blob (best-effort) i evidenci.
  try {
    await del(target.url);
  } catch {
    // Blob už nemusí existovat — evidenci smažeme tak jako tak.
  }

  local.attachments = local.attachments.filter((a) => a.id !== attachmentId);
  local.updatedBy = g.session.user!.email!;
  local.updatedAt = new Date().toISOString();
  await saveLocationLocal(local);
  bustLocations();

  return NextResponse.json({ ok: true });
}
