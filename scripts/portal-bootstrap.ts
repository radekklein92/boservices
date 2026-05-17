#!/usr/bin/env tsx
/**
 * BOServices portál — bootstrap superadmin / pozvánka.
 *
 * Použití:
 *   yarn portal:bootstrap                          # klein.radek@seznam.cz / Radek Klein
 *   yarn portal:bootstrap user@example.com         # vlastní e-mail
 *   yarn portal:bootstrap user@example.com "Jméno" # vlastní e-mail + jméno
 *
 * Skript:
 *   1. Načte .env.local (Upstash creds + Resend + SITE_URL).
 *   2. Přidá e-mail do allowlistu jako "admin" (superadmin se přepne automaticky
 *      pro e-maily uvedené v PORTAL_SUPERADMIN_EMAILS / hardcoded klein.radek).
 *   3. Vygeneruje pozvánkový token (TTL 7 dní).
 *   4. Vypíše URL pro nastavení hesla + pošle e-mail (pokud má Resend).
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const email = (process.argv[2] ?? "klein.radek@seznam.cz").toLowerCase();
  const name = process.argv[3] ?? "Radek Klein";

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("✘ UPSTASH_REDIS_REST_URL nebo UPSTASH_REDIS_REST_TOKEN chybí v .env.local");
    process.exit(1);
  }

  const { upsertAllowlistEntry } = await import("../lib/portal/allowlist-db.js");
  const { createAuthToken } = await import("../lib/portal/auth-tokens.js");
  const { sendInviteEmail } = await import("../lib/portal/email.js");

  console.log(`\nBootstrap portálu pro: ${email} (${name})\n`);

  await upsertAllowlistEntry({
    email,
    name,
    role: "admin",
    invitedBy: "system",
    invitedAt: new Date().toISOString(),
    status: "pending",
  });
  console.log("  ✓ přidán do allowlistu");

  const token = await createAuthToken("set-password", email);
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.boservices.cz"}/portal/set-password?token=${token}`;
  console.log("  ✓ token vygenerován (platnost 7 dní)\n");
  console.log("Pozvánkový odkaz:");
  console.log(`  ${url}\n`);

  if (process.env.RESEND_API_KEY) {
    try {
      await sendInviteEmail({ to: email, name, invitedBy: "system", token });
      console.log(`  ✓ pozvánka odeslána e-mailem na ${email}`);
    } catch (err) {
      console.error("  ✘ odeslání e-mailu selhalo:", err);
    }
  } else {
    console.log("  ⚠ RESEND_API_KEY není nastaven — použijte URL výše");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
