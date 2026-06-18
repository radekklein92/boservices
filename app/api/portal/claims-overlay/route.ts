import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireSession } from "@/lib/portal/auth-guard";
import {
  getClaimsOverlay,
  setClaimsOverlay,
} from "@/lib/portal/claims-overlay-db";
import { bustClaimsOverlay } from "@/lib/portal/revalidate";

const guarantorSchema = z.object({
  id: z.string().max(100),
  company: z.string().trim().max(300),
  confirmedOverOneYear: z.boolean(),
});

const manualClaimSchema = z.object({
  id: z.string().max(100),
  name: z.string().trim().max(300),
  amount: z.string().max(60),
  primaryDebtor: z.string().trim().max(300),
  guarantors: z.array(guarantorSchema).max(50),
  note: z.string().max(2000).optional(),
  createdAt: z.string().max(40).optional(),
  updatedAt: z.string().max(40).optional(),
});

const overlaySchema = z.object({
  manualClaims: z.array(manualClaimSchema).max(500),
  guaranteesByClaimId: z.record(
    z.string().max(120),
    z.array(guarantorSchema).max(50),
  ),
});

// Čísla vidí každý přihlášený (jako dashboard).
export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const overlay = await getClaimsOverlay();
  return NextResponse.json({ ok: true, overlay });
}

// Zápis jen admin. Full-replace - editor drží celý stav a ukládá ho najednou.
export async function PUT(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = overlaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  await setClaimsOverlay({
    manualClaims: parsed.data.manualClaims.map((m) => ({
      ...m,
      note: m.note ?? "",
      createdAt: m.createdAt || now,
      updatedAt: now,
    })),
    guaranteesByClaimId: parsed.data.guaranteesByClaimId,
  });
  bustClaimsOverlay();
  return NextResponse.json({ ok: true });
}
