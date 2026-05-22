import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { getUser, listUsers } from "@/lib/portal/users-db";
import { listAllowlist, upsertAllowlistEntry } from "@/lib/portal/allowlist-db";
import { createAuthToken } from "@/lib/portal/auth-tokens";
import { sendInviteEmail } from "@/lib/portal/email";
import { bustUsers } from "@/lib/portal/revalidate";

export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const [users, allowlist] = await Promise.all([listUsers(), listAllowlist()]);

  const sanitizedUsers = users.map(({ passwordHash, ...u }) => u);
  const pending = allowlist.filter((a) => a.status === "pending");

  return NextResponse.json({
    ok: true,
    users: sanitizedUsers,
    allowlist: pending,
  });
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  role: z.enum(["admin", "user"]),
});

export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Vyplňte platný e-mail a vyberte roli." },
      { status: 400 },
    );
  }

  const { email, name, role } = parsed.data;

  const existingUser = await getUser(email);
  if (existingUser?.passwordHash) {
    return NextResponse.json(
      { ok: false, error: "Tento e-mail už má aktivní účet." },
      { status: 409 },
    );
  }

  const invitedBy = g.session.user?.email ?? "system";
  await upsertAllowlistEntry({
    email,
    name: name?.trim() || undefined,
    role,
    invitedBy,
    invitedAt: new Date().toISOString(),
    status: "pending",
  });

  const token = await createAuthToken("set-password", email);
  try {
    await sendInviteEmail({
      to: email,
      name: name?.trim() || undefined,
      invitedBy,
      token,
    });
  } catch (err) {
    console.error("[portal users] invite email failed", err);
  }

  bustUsers();
  return NextResponse.json({ ok: true });
}
