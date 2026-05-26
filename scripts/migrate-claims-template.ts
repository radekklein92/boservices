#!/usr/bin/env tsx
/**
 * Chirurgická migrace JEDNÉ šablony: claim-assignment.
 * Nahradí v uloženém HTML statický odstavec „Doplňte tabulkou…" tokenem
 * {{claimsTable}} (ensureClaimsToken). Vše ostatní (name, letterhead,
 * updatedBy, updatedAt, approvedAt, approvedBy) zůstává beze změny - takže
 * se NEMĚNÍ stav schválení šablony.
 *
 * Bezpečnost:
 *   - před zápisem uloží zálohu původního objektu do /tmp (reverzibilní)
 *   - idempotentní: pokud už token v HTML je, nic nezapisuje
 *
 * Použití:  yarn tsx scripts/migrate-claims-template.ts
 */
import { config } from "dotenv";
import { writeFile } from "node:fs/promises";

config({ path: ".env.local" });

async function main() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    console.error("✘ UPSTASH_REDIS_REST_URL/TOKEN chybí v .env.local");
    process.exit(1);
  }

  const { getContractTemplate, upsertContractTemplate } = await import(
    "../lib/portal/contract-templates-db"
  );
  const { ensureClaimsToken, CLAIMS_TOKEN } = await import("../lib/portal/claims");

  const existing = await getContractTemplate("claim-assignment");
  if (!existing) {
    console.log(
      "ℹ  claim-assignment není uložen v Redisu — getOrSeedContractTemplate použije default (už s tokenem). Není co migrovat.",
    );
    return;
  }

  console.log(
    `Načteno: html ${existing.html.length} znaků · token přítomen: ${existing.html.includes(CLAIMS_TOKEN)} · approvedAt: ${existing.approvedAt ?? "—"} · updatedAt: ${existing.updatedAt}`,
  );

  if (existing.html.includes(CLAIMS_TOKEN)) {
    console.log("✓ Token už je v šabloně — nic neměním (idempotentní).");
    return;
  }

  const nextHtml = ensureClaimsToken(existing.html);
  if (nextHtml === existing.html) {
    console.warn(
      "⚠  ensureClaimsToken nic nezměnil — nenašel jsem ani legacy text, ani nadpis Přílohy č. 1. Nechávám beze změny.",
    );
    return;
  }

  const backupPath = `/tmp/claim-assignment-template-backup-${Date.now()}.json`;
  await writeFile(backupPath, JSON.stringify(existing, null, 2), "utf-8");
  console.log(`💾 Záloha původního objektu: ${backupPath}`);

  await upsertContractTemplate({ ...existing, html: nextHtml });
  console.log(
    `✓ Šablona claim-assignment aktualizována (html ${nextHtml.length} znaků). Schválení i ostatní pole zachovány.`,
  );
}

main().catch((err) => {
  console.error("✘ Migrace selhala:", err);
  process.exit(1);
});
