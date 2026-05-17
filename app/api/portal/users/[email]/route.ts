import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { deleteUser, getUser, upsertUser } from "@/lib/portal/users-db";
import { removeAllowlistEntry } from "@/lib/portal/allowlist-db";

const patchSchema = z.object({
  role: z.enum(["admin", "user", "superadmin"]).optional(),
  name: z.string().trim().max(120).optional(),
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

  await upsertUser({
    ...user,
    role: parsed.data.role ?? user.role,
    name: parsed.data.name?.trim() || user.name,
  });

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
  return NextResponse.json({ ok: true });
}
