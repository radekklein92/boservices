import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { deleteUser, getUser, upsertUser } from "@/lib/portal/users-db";
import { removeAllowlistEntry } from "@/lib/portal/allowlist-db";
import { bustUsers } from "@/lib/portal/revalidate";

const patchSchema = z.object({
  role: z.enum(["admin", "user", "superadmin"]).optional(),
  name: z.string().trim().max(120).optional(),
  isSigner: z.boolean().optional(),
  signerFunction: z.enum(["jednatel", "power-of-attorney"]).nullable().optional(),
  signerDisplayName: z.string().trim().max(160).nullable().optional(),
});

function decodeEmail(raw: string): string {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { email: raw } = await params;
  const email = decodeEmail(raw);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed" }, { status: 400 });
  }

  const user = await getUser(email);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Uživatel nenalezen." }, { status: 404 });
  }

  if (
    parsed.data.role === "superadmin" &&
    g.session.user?.role !== "superadmin"
  ) {
    return NextResponse.json(
      { ok: false, error: "Roli superadmin může nastavit pouze superadmin." },
      { status: 403 },
    );
  }

  // Když isSigner=false, vymažeme signerFunction a signerDisplayName, aby v DB
  // nezůstal mrtvý stav. Když je isSigner=true, signerFunction je povinná.
  const nextIsSigner = parsed.data.isSigner ?? user.isSigner;
  let nextSignerFunction = user.signerFunction;
  let nextSignerDisplayName = user.signerDisplayName;
  if (parsed.data.isSigner === false) {
    nextSignerFunction = undefined;
    nextSignerDisplayName = undefined;
  } else {
    if (parsed.data.signerFunction !== undefined) {
      nextSignerFunction = parsed.data.signerFunction ?? undefined;
    }
    if (parsed.data.signerDisplayName !== undefined) {
      nextSignerDisplayName =
        parsed.data.signerDisplayName?.trim() || undefined;
    }
  }
  if (nextIsSigner && !nextSignerFunction) {
    return NextResponse.json(
      { ok: false, error: "Vyber funkci podepisujícího." },
      { status: 400 },
    );
  }

  await upsertUser({
    ...user,
    role: parsed.data.role ?? user.role,
    name: parsed.data.name?.trim() || user.name,
    isSigner: nextIsSigner || false,
    signerFunction: nextSignerFunction,
    signerDisplayName: nextSignerDisplayName,
  });

  bustUsers();
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { email: raw } = await params;
  const email = decodeEmail(raw);

  if (g.session.user?.email === email) {
    return NextResponse.json(
      { ok: false, error: "Sám sebe smazat nelze." },
      { status: 400 },
    );
  }

  const user = await getUser(email);
  if (
    user?.role === "superadmin" &&
    g.session.user?.role !== "superadmin"
  ) {
    return NextResponse.json(
      { ok: false, error: "Superadmin může smazat pouze jiný superadmin." },
      { status: 403 },
    );
  }

  await Promise.all([deleteUser(email), removeAllowlistEntry(email)]);
  bustUsers();
  return NextResponse.json({ ok: true });
}
