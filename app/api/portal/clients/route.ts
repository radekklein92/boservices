import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustClients } from "@/lib/portal/revalidate";
import {
  countClients,
  getClientByIco,
  listClients,
  upsertClient,
} from "@/lib/portal/clients-db";
import { normalizePlanned } from "@/lib/portal/client-contract-status";

const clientPayload = z.object({
  legalForm: z.enum(["PO", "FO"]),
  companyName: z.string().trim().min(2).max(200),
  // IČO/registrační číslo - volné (české IČO 8 míst, ale i zahraniční: polský
  // REGON 9/14 míst, slovenské IČO, NIP…). Žádný pevný formát, ať jde přidat i
  // firmu mimo český rejstřík. Prázdné je povolené (firma bez reg. čísla).
  ico: z.string().trim().max(32).optional().or(z.literal("")),
  dic: z.string().trim().max(20).optional().or(z.literal("")),
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
  plannedContracts: z
    .record(
      z.enum([
        "franchise",
        "cooperation",
        "operation",
        "claim-bundle",
        "withdrawal",
      ]),
      z.number().int().min(0).max(99),
    )
    .optional(),
});

export type ClientPayload = z.infer<typeof clientPayload>;

function strip<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== "" && v !== undefined),
  ) as Partial<T>;
}

export async function GET(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  // Volitelná paginace - viz contracts endpoint.
  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const limit = limitRaw ? Math.max(1, Math.min(500, Number(limitRaw))) : undefined;
  const offset = offsetRaw ? Math.max(0, Number(offsetRaw)) : 0;
  const [clients, total] = await Promise.all([
    listClients({ limit, offset }),
    limit !== undefined ? countClients() : Promise.resolve(undefined),
  ]);
  return NextResponse.json({
    ok: true,
    clients,
    ...(total !== undefined ? { total, limit, offset } : {}),
  });
}

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = clientPayload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (d.ico) {
    const existing = await getClientByIco(d.ico);
    if (existing) {
      return NextResponse.json(
        { ok: false, error: `IČO ${d.ico} už používá: ${existing.companyName}.` },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  const id = nanoid(12);
  const statutory =
    d.statutory && d.statutory.name?.trim()
      ? strip({ name: d.statutory.name.trim(), role: d.statutory.role?.trim() })
      : undefined;
  const contact =
    d.contact && (d.contact.name || d.contact.email || d.contact.phone)
      ? strip({
          name: d.contact.name?.trim(),
          email: d.contact.email?.trim(),
          phone: d.contact.phone?.trim(),
        })
      : undefined;

  await upsertClient({
    id,
    legalForm: d.legalForm,
    companyName: d.companyName.trim(),
    ico: d.ico || undefined,
    dic: d.dic?.trim() || undefined,
    address: {
      street: d.address.street.trim(),
      city: d.address.city.trim(),
      zip: d.address.zip.trim(),
      country: d.address.country?.trim() || "Česká republika",
    },
    statutory: statutory as { name: string; role?: string } | undefined,
    contact: contact as
      | { name?: string; email?: string; phone?: string }
      | undefined,
    plannedContracts: normalizePlanned(d.plannedContracts),
    createdBy: g.session.user!.email!,
    createdAt: now,
    updatedAt: now,
  });

  bustClients();
  return NextResponse.json({ ok: true, id });
}
