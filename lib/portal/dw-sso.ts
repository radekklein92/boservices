import "server-only";
import crypto from "node:crypto";

// SSO handoff to the DW dashboard (dw.boservices.cz). A logged-in portal admin can
// deep-link into the dashboard's Clouds / API-keys admin pages without a second login:
// we mint a short-lived HMAC token (shared SSO_SECRET) that the dashboard's /api/sso
// verifies and trades for its own bo_session. SSO_SECRET is a secret → server-only.

const DW_BASE = (process.env.DW_BASE ?? "https://dw.boservices.cz").replace(/\/$/, "");
const HANDOFF_TTL_SEC = 120; // short — the URL is followed immediately on click

export function isDwSsoConfigured(): boolean {
  return !!process.env.SSO_SECRET;
}

export function dwBase(): string {
  return DW_BASE;
}

/** Mints the short-lived token the dashboard's /api/sso verifies. Format matches lib/sso.ts there. */
export function mintHandoff(email: string, role: "admin" | "user" = "admin"): string {
  const secret = process.env.SSO_SECRET;
  if (!secret) throw new Error("SSO_SECRET not set");
  const now = Math.floor(Date.now() / 1000);
  const payload = { email, role, iat: now, exp: now + HANDOFF_TTL_SEC };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Full dashboard SSO URL that lands the user on an internal `next` path, authenticated. */
export function dwSsoUrl(next: string, email: string): string {
  const u = new URL(`${DW_BASE}/api/sso`);
  u.searchParams.set("next", next);
  u.searchParams.set("token", mintHandoff(email, "admin"));
  return u.toString();
}
