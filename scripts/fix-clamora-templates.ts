#!/usr/bin/env tsx
/**
 * Chirurgická migrace šablon postoupení pohledávek v Redisu:
 *   - claim-assignment, side-fee
 *
 * Úpravy (kosmetické, schválené zadavatelem):
 *   1. Odstranění „, DIČ: {{providerDic}}" z řádku Postupníka (Clamora nemá DIČ)
 *   2. side-fee: číslo účtu {{clientBankAccount}} -> linka k ručnímu doplnění
 *   3. claim-assignment: jistota tokenu {{claimsTable}} (idempotentní)
 *
 * Vše ostatní (name, letterhead, updatedBy, updatedAt, approvedAt, approvedBy)
 * zůstává BEZE ZMĚNY - protože updatedAt se nemění a approvedAt >= updatedAt,
 * šablona zůstává SCHVÁLENÁ (žádná nová fabrikace schválení).
 *
 * Bezpečnost: před zápisem zálohuje původní objekt do /tmp. Idempotentní.
 *
 * Použití:  yarn tsx scripts/fix-clamora-templates.ts
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

  const { getContractTemplate, upsertContractTemplate, isTemplateApproved } =
    await import("../lib/portal/contract-templates-db");
  const { ensureClaimsToken, stripClamoraDicAndBank } = await import(
    "../lib/portal/claims"
  );

  const types = ["claim-assignment", "side-fee"] as const;

  for (const type of types) {
    const existing = await getContractTemplate(type);
    if (!existing) {
      console.log(`⏭  ${type}: není v Redisu, přeskakuji (default už je opravený).`);
      continue;
    }

    const nextHtml = stripClamoraDicAndBank(ensureClaimsToken(existing.html));
    if (nextHtml === existing.html) {
      console.log(`✓ ${type}: žádná změna (idempotentní).`);
      continue;
    }

    const backupPath = `/tmp/${type}-template-backup-${Date.now()}.json`;
    await writeFile(backupPath, JSON.stringify(existing, null, 2), "utf-8");

    // Pouze html; ostatní pole (vč. updatedAt/approvedAt) zachována -> zůstává schválená.
    await upsertContractTemplate({ ...existing, html: nextHtml });
    const after = await getContractTemplate(type);
    console.log(
      `✓ ${type}: html ${existing.html.length} -> ${nextHtml.length} znaků · schválená: ${after ? isTemplateApproved(after) : "?"} · záloha: ${backupPath}`,
    );
  }
}

main().catch((err) => {
  console.error("✘ Migrace selhala:", err);
  process.exit(1);
});
