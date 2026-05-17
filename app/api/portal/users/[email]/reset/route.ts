import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { getUser, upsertUser } from "@/lib/portal/users-db";
import { createAuthToken } from "@/lib/portal/auth-tokens";
import { sendResetEmail } from "@/lib/portal/email";

function decodeEmail(raw: string): string {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { email: raw } = await params;
  const email = decodeEmail(raw);

  const user = await getUser(email);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Uživatel nenalezen." },
      { status: 404 },
    );
  }

  if (
    user.role === "superadmin" &&
    g.session.user?.role !== "superadmin" &&
    g.session.user?.email !== user.email
  ) {
    return NextResponse.json(
      { ok: false, error: "Heslo superadmina může resetovat pouze superadmin." },
      { status: 403 },
    );
  }

  // Wipe password hash so the user cannot log in until they set a new one
  const { passwordHash, ...rest } = user;
  void passwordHash;
  await upsertUser({ ...rest });

  const token = await createAuthToken("forgot", email);
  try {
    await sendResetEmail({
      to: email,
      name: user.name,
      token,
      kind: "admin-reset",
    });
  } catch (err) {
    console.error("[portal users] reset email failed", err);
  }

  return NextResponse.json({ ok: true });
}
