import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { dwSsoUrl, dwBase, isDwSsoConfigured } from "@/lib/portal/dw-sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nav links to the DW dashboard's admin pages go through here so the handoff token is
// minted fresh at click-time (never baked into rendered HTML) and the user lands
// authenticated. Admin-only; falls back to the bare dashboard page (manual login) if
// SSO_SECRET isn't configured yet.
const TARGETS: Record<string, string> = {
  clouds: "/clouds",
  "api-keys": "/settings/api-keys",
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  const email = session?.user?.email;
  if (!email || !isAdminRole(session?.user?.role)) {
    return NextResponse.redirect(new URL("/portal", req.url));
  }

  const next = TARGETS[req.nextUrl.searchParams.get("to") ?? ""];
  if (!next) return NextResponse.redirect(new URL("/portal", req.url));

  const target = isDwSsoConfigured() ? dwSsoUrl(next, email) : `${dwBase()}${next}`;
  return NextResponse.redirect(target);
}
