#!/usr/bin/env tsx
/**
 * Backfill approvedHtml u aktuálně SCHVÁLENÝCH šablon (isTemplateApproved &&
 * chybí approvedHtml). Nastaví approvedHtml = html (současný = schválený stav),
 * aby diff „co se změnilo od schválení" fungoval hned po příští editaci.
 *
 * Nic jiného nemění (html/approvedAt/updatedAt zůstávají) -> stav schválení
 * se nemění. Idempotentní.
 *
 * Použití:  yarn tsx scripts/backfill-approved-html.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("✘ UPSTASH_REDIS_REST_URL/TOKEN chybí");
    process.exit(1);
  }

  const { listContractTemplates, upsertContractTemplate, isTemplateApproved } =
    await import("../lib/portal/contract-templates-db");

  const entries = await listContractTemplates();
  let changed = 0;
  let skipped = 0;

  for (const entry of entries) {
    const variants = entry.variants
      ? entry.variants.map((v) => ({ t: v.template, variant: v.variant }))
      : [{ t: entry.template, variant: undefined }];
    for (const { t, variant } of variants) {
      if (!t) continue;
      const label = `${entry.type}${variant ? ":" + variant : ""}`;
      if (!isTemplateApproved(t)) {
        console.log(`⏭  ${label}: není schválená, skip`);
        skipped++;
        continue;
      }
      if (t.approvedHtml) {
        console.log(`✓ ${label}: approvedHtml už je, skip`);
        skipped++;
        continue;
      }
      await upsertContractTemplate({
        ...t,
        type: entry.type,
        variant,
        approvedHtml: t.html,
      });
      console.log(`✓ ${label}: approvedHtml nastaveno (${t.html.length} znaků)`);
      changed++;
    }
  }

  console.log(`Hotovo — doplněno ${changed}, přeskočeno ${skipped}.`);
}

main().catch((err) => {
  console.error("✘ Backfill selhal:", err);
  process.exit(1);
});
