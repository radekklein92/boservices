import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeAuthToken, peekAuthToken } from "@/lib/portal/auth-tokens";
import {
  getAllowlistEntry,
  markAllowlistActive,
} from "@/lib/portal/allowlist-db";
import { getUser, upsertUser, type UserRole } from "@/lib/portal/users-db";
import { hashPassword, passwordIssues } from "@/lib/portal/passwords";
import { bustUsers } from "@/lib/portal/revalidate";

const SUPERADMIN_EMAILS = (process.env.PORTAL_SUPERADMIN_EMAILS ?? "klein.radek@seznam.cz")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const submitSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(10),
});

const verifySchema = z.object({ token: z.string().min(10) });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = verifySchema.safeParse({ token: url.searchParams.get("token") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Chybí token." }, { status: 400 });
  }
  const { token } = parsed.data;
  let email = await peekAuthToken("set-password", token);
  let kind: "set-password" | "forgot" = "set-password";
  if (!email) {
    email = await peekAuthToken("forgot", token);
    kind = "forgot";
  }
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Odkaz vypršel nebo byl už použit." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, email, kind });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Vyplňte všechna pole." }, { status: 400 });
  }
  const { token, password } = parsed.data;

  const issues = passwordIssues(password);
  if (issues.length) {
    return NextResponse.json({ ok: false, error: issues.join(" ") }, { status: 400 });
  }

  let email = await consumeAuthToken("set-password", token);
  let kind: "first-login" | "forgot" = "first-login";
  if (!email) {
    email = await consumeAuthToken("forgot", token);
    kind = "forgot";
  }
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Odkaz vypršel nebo byl už použit." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  const existing = await getUser(email);

  if (existing) {
    await upsertUser({ ...existing, passwordHash });
  } else {
    const al = await getAllowlistEntry(email);
    if (!al) {
      return NextResponse.json(
        { ok: false, error: "E-mail není v allowlistu." },
        { status: 403 },
      );
    }
    const role: UserRole = SUPERADMIN_EMAILS.includes(email) ? "superadmin" : al.role;
    await upsertUser({
      email,
      name: al.name?.trim() || email,
      role,
      passwordHash,
      createdAt: new Date().toISOString(),
    });
  }
  // markAllowlistActive voláme vždy (idempotentní). Když user už existoval
  // a šel přes forgot password, allowlist by mohla mít stale pending stav -
  // tady to spolehlivě dorovnáme.
  await markAllowlistActive(email);
  // Cache invalidation - bez tohohle by /portal/users list vracel stale
  // pending pozvánku, dokud nevyprší 1h TTL nebo nezasáhne jiná mutace.
  bustUsers();

  return NextResponse.json({ ok: true, email, kind });
}
