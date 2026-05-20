#!/usr/bin/env tsx
/**
 * Vypíše aktuální HTML všech šablon z Upstash Redisu do souborů
 * /tmp/template-{type}[-{variant}].html. Použito jako mezi-krok, abychom
 * mohli aktualizovat default-templates.ts na současný stav uložený v Redisu.
 */
import { config } from "dotenv";
import { writeFile, mkdir } from "node:fs/promises";

config({ path: ".env.local" });

async function main() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    console.error("✘ UPSTASH_REDIS_REST_URL/TOKEN chybí");
    process.exit(1);
  }

  const { CONTRACT_TYPES, getVariantsForType, hasVariants, isBundleType } =
    await import("../lib/portal/contract-types");
  const { getContractTemplate } = await import(
    "../lib/portal/contract-templates-db"
  );

  await mkdir("/tmp/templates-dump", { recursive: true });

  for (const type of CONTRACT_TYPES) {
    if (isBundleType(type)) continue;

    if (hasVariants(type)) {
      for (const variant of getVariantsForType(type)) {
        const tpl = await getContractTemplate(type, variant as any);
        if (!tpl) {
          console.log(`⏭  ${type}:${variant} — chybí v Redis`);
          continue;
        }
        const path = `/tmp/templates-dump/${type}-${variant}.html`;
        await writeFile(path, tpl.html, "utf-8");
        console.log(`✓ ${type}:${variant} (${tpl.html.length} znaků) → ${path}`);
      }
    } else {
      const tpl = await getContractTemplate(type);
      if (!tpl) {
        console.log(`⏭  ${type} — chybí v Redis`);
        continue;
      }
      const path = `/tmp/templates-dump/${type}.html`;
      await writeFile(path, tpl.html, "utf-8");
      console.log(`✓ ${type} (${tpl.html.length} znaků) → ${path}`);
    }
  }
}

main().catch((err) => {
  console.error("✘ Dump selhal:", err);
  process.exit(1);
});
