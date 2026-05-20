#!/usr/bin/env tsx
/**
 * BOServices portál — uloží aktuální výchozí znění VŠECH šablon smluv
 * z kódu (default-templates.ts → buildDefaultHtml) do Upstash Redis.
 *
 * Použití:
 *   yarn tsx scripts/seed-templates.ts
 *
 * Co dělá:
 *   1. Načte .env.local (Upstash creds)
 *   2. Pro každý CONTRACT_TYPE (kromě claim-bundle, který nemá vlastní šablonu)
 *      a každou jeho variantu (pokud má) vezme buildDefaultHtml a upsertne
 *      do Redisu jako ContractTemplate s updatedBy="system (reseed)".
 *
 * Smysl: po změně defaultů ve výchozích šablonách chceš, aby aktuální stav
 * byl persistován jako šablona pro budoucí smlouvy, bez ručního Reset+Save
 * pro každý typ + variantu v UI.
 *
 * POZOR: přepíše veškeré uložené šablony v Redisu. Pokud admin předtím
 * udělal vlastní úpravy v editoru, budou ztraceny.
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

  const {
    CONTRACT_TYPES,
    CONTRACT_TYPE_META,
    getVariantsForType,
    hasVariants,
    isBundleType,
  } = await import("../lib/portal/contract-types");
  const { buildDefaultHtml } = await import(
    "../lib/portal/default-templates"
  );
  const { upsertContractTemplate } = await import(
    "../lib/portal/contract-templates-db"
  );

  const now = new Date().toISOString();
  let count = 0;

  for (const type of CONTRACT_TYPES) {
    // claim-bundle nemá vlastní šablonu - skládá se ze 3 zdrojových
    // (claim-assignment, side-fee, assignment-notice), ty se seedují samostatně.
    if (isBundleType(type)) {
      console.log(`⏭  ${type}: skip (bundle nemá vlastní šablonu)`);
      continue;
    }

    const meta = CONTRACT_TYPE_META[type];

    if (hasVariants(type)) {
      for (const variant of getVariantsForType(type)) {
        const html = buildDefaultHtml(type, variant as any);
        await upsertContractTemplate({
          type,
          variant: variant as any,
          name: meta.fullName,
          html,
          updatedBy: "system (reseed)",
          updatedAt: now,
        });
        console.log(
          `✓ ${type}:${variant} uloženo (${html.length} znaků)`,
        );
        count++;
      }
    } else {
      const html = buildDefaultHtml(type);
      await upsertContractTemplate({
        type,
        name: meta.fullName,
        html,
        updatedBy: "system (reseed)",
        updatedAt: now,
      });
      console.log(`✓ ${type} uloženo (${html.length} znaků)`);
      count++;
    }
  }

  console.log(`Hotovo — přepsáno ${count} šablon.`);
}

main().catch((err) => {
  console.error("✘ Reseed selhal:", err);
  process.exit(1);
});
