#!/usr/bin/env tsx
/**
 * Nastaví u postoupení pohledávek (claim-assignment, claim-bundle) zástupce
 * Poskytovatele (Clamora Bridge) na aktuální default z CLAMORA_BRIDGE_DEFAULTS
 * (Mgr. Petr Zapletal / na základě plné moci).
 *
 * Aplikuje se POUZE na smlouvy, které NEJSOU podepsané ani BOS (signedAt) ani
 * klientem (clientSignedAt). Podepsané smlouvy zůstávají beze změny.
 *
 * U dotčených smluv zneplatní vygenerované PDF (generatedPdf*), aby se
 * přegenerovalo s novým zástupcem. Status (milestones) se nemění.
 *
 * Bezpečnost: záloha původních hodnot do /tmp. Idempotentní.
 *
 * Použití:  yarn tsx scripts/fix-clamora-rep.ts
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

  const { listContracts, upsertContract } = await import(
    "../lib/portal/contracts-db"
  );
  const { CLAMORA_BRIDGE_DEFAULTS } = await import("../lib/portal/contract-render");

  const NAME = CLAMORA_BRIDGE_DEFAULTS.providerStatutory1Name!;
  const ROLE = CLAMORA_BRIDGE_DEFAULTS.providerStatutory1Role!;

  const all = await listContracts();
  const targets = all.filter(
    (c) =>
      (c.type === "claim-assignment" || c.type === "claim-bundle") &&
      !c.signedAt &&
      !c.clientSignedAt,
  );

  console.log(
    `Postoupení celkem: ${all.filter((c) => c.type === "claim-assignment" || c.type === "claim-bundle").length} · nepodepsaných (kandidáti): ${targets.length}`,
  );

  const backup: unknown[] = [];
  let changed = 0;

  for (const c of targets) {
    const oldName = c.variables.providerStatutory1Name ?? "";
    const oldRole = c.variables.providerStatutory1Role ?? "";
    if (oldName === NAME && oldRole === ROLE) {
      console.log(`✓ ${c.number ?? c.id}: už nastaveno, skip`);
      continue;
    }
    backup.push({
      id: c.id,
      number: c.number,
      providerStatutory1Name: oldName,
      providerStatutory1Role: oldRole,
      generatedPdfUrl: c.generatedPdfUrl,
      generatedPdfPath: c.generatedPdfPath,
      generatedAt: c.generatedAt,
    });
    await upsertContract({
      ...c,
      variables: {
        ...c.variables,
        providerStatutory1Name: NAME,
        providerStatutory1Role: ROLE,
      },
      // Vygenerované PDF je teď neaktuální -> zneplatnit (přegeneruje se).
      generatedPdfUrl: undefined,
      generatedPdfPath: undefined,
      generatedAt: undefined,
      updatedAt: new Date().toISOString(),
    });
    changed++;
    console.log(
      `✓ ${c.number ?? c.id} (${c.type}): "${oldName} / ${oldRole}" -> "${NAME} / ${ROLE}"`,
    );
  }

  if (backup.length) {
    const backupPath = `/tmp/clamora-rep-backup-${Date.now()}.json`;
    await writeFile(backupPath, JSON.stringify(backup, null, 2), "utf-8");
    console.log(`💾 Záloha původních hodnot: ${backupPath}`);
  }
  console.log(`Hotovo — upraveno ${changed} smluv.`);
}

main().catch((err) => {
  console.error("✘ Migrace selhala:", err);
  process.exit(1);
});
