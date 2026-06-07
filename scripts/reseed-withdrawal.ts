#!/usr/bin/env tsx
/**
 * BOServices portál — smaže uložené šablony odstoupení (withdrawal A + B)
 * z Redisu, aby je příští getOrSeedContractTemplate znovu naseedoval z nového
 * buildDefaultHtml (inline tokeny, MS volitelně, bez žargonu). Po re-seedu jsou
 * šablony nepodepsané -> nutné znovu schválit v UI (Šablony).
 *
 * Cílené ZÁMĚRNĚ jen na withdrawal, aby se nepřepsaly admin úpravy jiných typů.
 *
 * Použití:
 *   yarn tsx scripts/reseed-withdrawal.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    console.error(
      "✘ UPSTASH_REDIS_REST_URL nebo UPSTASH_REDIS_REST_TOKEN chybí v .env.local",
    );
    process.exit(1);
  }

  const { deleteContractTemplate, getOrSeedContractTemplate } = await import(
    "../lib/portal/contract-templates-db"
  );

  for (const variant of ["A", "B"] as const) {
    await deleteContractTemplate("withdrawal", variant);
    const fresh = await getOrSeedContractTemplate("withdrawal", variant);
    console.log(
      `✓ withdrawal:${variant} re-seed (${fresh.html.length} znaků, schváleno: ne)`,
    );
  }

  console.log("Hotovo — odstoupení A i B čeká na schválení v UI.");
}

main().catch((err) => {
  console.error("✘ Re-seed odstoupení selhal:", err);
  process.exit(1);
});
