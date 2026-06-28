import { NextResponse } from "next/server";
import { MLINK_COOKIE, verifyPin } from "@/lib/portal/pos/mobile-link-db";

// Veřejné odemčení mobilního odkazu PINem. Bez session - chrání ho jen tajný token v
// cestě + PIN (+ rate-limit v verifyPin). Úspěch nastaví httpOnly cookie scoped na
// /m/{token}, takže si zařízení odemčení zapamatuje (cookie = unlockToken odkazu).

export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 dní - "zapamatovat na tomto zařízení"

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let pin = "";
  try {
    const body = (await req.json()) as { pin?: unknown };
    pin = typeof body.pin === "string" ? body.pin.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const result = await verifyPin(token, pin);
  if (!result.ok) {
    const status = result.reason === "missing" ? 404 : result.reason === "locked" ? 429 : 401;
    return NextResponse.json({ ok: false, reason: result.reason }, { status });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(MLINK_COOKIE(token), result.unlockToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/m/${token}`,
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
