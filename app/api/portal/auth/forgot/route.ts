import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/portal/users-db";
import { createAuthToken } from "@/lib/portal/auth-tokens";
import { sendResetEmail } from "@/lib/portal/email";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { email } = parsed.data;
  const user = await getUser(email);

  if (user && user.passwordHash) {
    const token = await createAuthToken("forgot", email);
    try {
      await sendResetEmail({ to: email, name: user.name, token, kind: "self-forgot" });
    } catch (err) {
      console.error("[portal forgot] email send failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}
