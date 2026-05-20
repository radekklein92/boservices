#!/usr/bin/env tsx
/**
 * BOServices portál — uloží aktuální výchozí znění šablon „Odstoupení od smluv"
 * (variant A i B) z kódu do Upstash Redis jako uložené šablony.
 *
 * Použití:
 *   yarn tsx scripts/seed-withdrawal-templates.ts
 *
 * Co dělá:
 *   1. Načte .env.local (Upstash creds)
 *   2. Pro každou variantu A/B vezme buildDefaultHtml("withdrawal", v)
 *   3. Upsertne do Redisu jako ContractTemplate s updatedBy="system (reseed)"
 *
 * Smysl: po změně defaultů v default-templates.ts a chceš, aby aktuální stav
 * byl persistován jako šablona pro budoucí smlouvy bez ručního Reset+Save v UI.
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

  const { CONTRACT_TYPE_META, WITHDRAWAL_VARIANTS } = await import(
    "../lib/portal/contract-types"
  );
  const { buildDefaultHtml } = await import(
    "../lib/portal/default-templates"
  );
  const { upsertContractTemplate } = await import(
    "../lib/portal/contract-templates-db"
  );

  const meta = CONTRACT_TYPE_META.withdrawal;
  const now = new Date().toISOString();

  for (const variant of WITHDRAWAL_VARIANTS) {
    const html = buildDefaultHtml("withdrawal", variant);
    await upsertContractTemplate({
      type: "withdrawal",
      variant,
      name: meta.fullName,
      html,
      updatedBy: "system (reseed)",
      updatedAt: now,
    });
    console.log(
      `✓ withdrawal:${variant} uloženo (${html.length} znaků, updatedAt=${now})`,
    );
  }

  console.log("Hotovo.");
}

main().catch((err) => {
  console.error("✘ Reseed selhal:", err);
  process.exit(1);
});
