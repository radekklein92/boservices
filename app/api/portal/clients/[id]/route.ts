import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustClients } from "@/lib/portal/revalidate";
import {
  deleteClient,
  getClient,
  getClientByIco,
  upsertClient,
  type Client,
} from "@/lib/portal/clients-db";

const updateSchema = z.object({
  legalForm: z.enum(["PO", "FO"]),
  companyName: z.string().trim().min(2).max(200),
  ico: z
    .string()
    .trim()
    .regex(/^\d{1,8}$/u)
    .optional()
    .or(z.literal("")),
  dic: z.string().trim().max(15).optional().or(z.literal("")),
  address: z.object({
    street: z.string().trim().min(1).max(160),
    city: z.string().trim().min(1).max(80),
    zip: z.string().trim().min(3).max(10),
    country: z.string().trim().max(60).optional(),
  }),
  statutory: z
    .object({
      name: z.string().trim().max(120).optional().or(z.literal("")),
      role: z.string().trim().max(80).optional().or(z.literal("")),
    })
    .optional(),
  contact: z
    .object({
      name: z.string().trim().max(120).optional().or(z.literal("")),
      email: z.string().trim().email().optional().or(z.literal("")),
      phone: z.string().trim().max(40).optional().or(z.literal("")),
    })
    .optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const { id } = await params;
  const client = await getClient(id);
  if (!client) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, client });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const existing = await getClient(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (d.ico && d.ico !== existing.ico) {
    const dup = await getClientByIco(d.ico);
    if (dup && dup.id !== existing.id) {
      return NextResponse.json(
        { ok: false, error: `IČO ${d.ico} už používá: ${dup.companyName}.` },
        { status: 409 },
      );
    }
  }

  const updated: Client = {
    ...existing,
    legalForm: d.legalForm,
    companyName: d.companyName.trim(),
    ico: d.ico || undefined,
    dic: d.dic?.trim() || undefined,
    address: {
      street: d.address.street.trim(),
      city: d.address.city.trim(),
      zip: d.address.zip.trim(),
      country: d.address.country?.trim() || existing.address.country || "Česká republika",
    },
    statutory:
      d.statutory && d.statutory.name?.trim()
        ? {
            name: d.statutory.name.trim(),
            role: d.statutory.role?.trim() || undefined,
          }
        : undefined,
    contact:
      d.contact && (d.contact.name || d.contact.email || d.contact.phone)
        ? {
            name: d.contact.name?.trim() || undefined,
            email: d.contact.email?.trim() || undefined,
            phone: d.contact.phone?.trim() || undefined,
          }
        : undefined,
    updatedAt: new Date().toISOString(),
  };
  await upsertClient(updated);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const { id } = await params;
  await deleteClient(id);
  bustClients();
  return NextResponse.json({ ok: true });
}
