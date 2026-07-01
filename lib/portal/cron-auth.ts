import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// Sdílené ověření cronů a interních endpointů: Authorization: Bearer <CRON_SECRET>.
//
// Fail-closed v produkci: když CRON_SECRET není nastaven, request ODMÍTNEME
// (jinak by šel cron/endpoint spustit kýmkoli z internetu). Mimo produkci
// (dev/preview) se auth bez secretu přeskočí, ať jde vše lokálně testovat.
//
// Vrací NextResponse (401) při zamítnutí, nebo null když je request v pořádku:
//   const unauthorized = verifyCronAuth(req);
//   if (unauthorized) return unauthorized;
export function verifyCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[cron-auth] CRON_SECRET nenastaven v produkci - odmítám request");
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return null;
  }
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
