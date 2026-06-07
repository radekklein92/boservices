#!/usr/bin/env tsx
/**
 * BOServices portál — ručně schválí šablony odstoupení (withdrawal A + B) přímo
 * v Redisu. Ekvivalent kliknutí „Schválit" v UI (nastaví approvedAt=now,
 * approvedBy, approvedHtml = aktuální html; updatedAt nechá beze změny).
 *
 * Použití:
 *   yarn tsx scripts/approve-withdrawal.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const APPROVER = "klein@wearetwist.com";

async function main() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    console.error("✘ UPSTASH creds chybí v .env.local");
    process.exit(1);
  }

  const { getOrSeedContractTemplate, upsertContractTemplate, isTemplateApproved } =
    await import("../lib/portal/contract-templates-db");

  const now = new Date().toISOString();
  for (const variant of ["A", "B"] as const) {
    const existing = await getOrSeedContractTemplate("withdrawal", variant);
    // approvedAt musí být >= updatedAt (jinak je šablona „pending"). Vezmeme
    // pozdější z (now, updatedAt), ať drobný posun hodin/pořadí zápisů nevadí.
    const approvedAt = existing.updatedAt > now ? existing.updatedAt : now;
    await upsertContractTemplate({
      ...existing,
      variant,
      approvedAt,
      approvedBy: APPROVER,
      approvedHtml: existing.html,
    });
    const check = await getOrSeedContractTemplate("withdrawal", variant);
    console.log(
      `✓ withdrawal:${variant} schváleno (${isTemplateApproved(check) ? "OK" : "POZOR: stále neschváleno"})`,
    );
  }
  console.log("Hotovo.");
}

main().catch((err) => {
  console.error("✘ Schválení selhalo:", err);
  process.exit(1);
});
