#!/usr/bin/env tsx
/**
 * Ruční srovnání firmy smlouvy na "BRYSTAN POLSKA sp. z o.o.".
 * Bez --apply jen vypíše stav (dry-run). S --apply provede změnu.
 *
 * Dorovná METADATA (clientId, clientName) + client* proměnné, přesune by-client
 * index a zneplatní vygenerované PDF. Jen u NEPODEPSANÝCH smluv. Záloha do /tmp.
 *
 * Použití: yarn tsx scripts/change-contract-to-polska.ts <contractId> [--apply]
 */
import { config } from "dotenv";
import { writeFile } from "node:fs/promises";

config({ path: ".env.local" });

const CONTRACT_ID = process.argv[2];
const APPLY = process.argv.includes("--apply");
const NEW_CLIENT_ID = "2uhXYJZK1PEX"; // BRYSTAN POLSKA sp. z o.o.

async function main() {
  if (!CONTRACT_ID) {
    console.error("✘ Chybí contractId. Použití: ... <contractId> [--apply]");
    process.exit(1);
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("✘ UPSTASH_REDIS_REST_URL/TOKEN chybí v .env.local");
    process.exit(1);
  }

  const { getRedis } = await import("../lib/redis");
  const { getContract, upsertContract } = await import("../lib/portal/contracts-db");
  const { getClient } = await import("../lib/portal/clients-db");
  const { buildClientVariables, setBakedValue } = await import(
    "../lib/portal/contract-render"
  );

  const contract = await getContract(CONTRACT_ID);
  const newClient = await getClient(NEW_CLIENT_ID);
  if (!contract) throw new Error(`Smlouva ${CONTRACT_ID} nenalezena`);
  if (!newClient) throw new Error(`Klient ${NEW_CLIENT_ID} nenalezen`);

  console.log("=== SMLOUVA ===");
  console.log({
    id: contract.id,
    type: contract.type,
    status: contract.status,
    number: contract.number,
    clientId: contract.clientId,
    clientName: contract.clientName,
    signedAt: contract.signedAt ?? null,
    clientSignedAt: contract.clientSignedAt ?? null,
    generatedPdf: contract.generatedPdfUrl ? "(ano)" : null,
  });

  if (contract.signedAt || contract.clientSignedAt) {
    throw new Error("Smlouva už je podepsaná - ruční změnu firmy nedělám.");
  }
  if (contract.clientId === NEW_CLIENT_ID) {
    console.log("✓ Už nastaveno na Brystan Polska, nic neměním.");
    return;
  }

  if (!APPLY) {
    console.log(
      `\n[dry-run] Změnil bych firmu "${contract.clientName}" -> "${newClient.companyName}".`,
    );
    console.log("Spusť znovu s --apply pro provedení.");
    return;
  }

  const backupPath = `/tmp/contract-${CONTRACT_ID}-backup-${Date.now()}.json`;
  await writeFile(backupPath, JSON.stringify(contract, null, 2), "utf-8");
  console.log(`💾 Záloha původní smlouvy: ${backupPath}`);

  const clientVars = buildClientVariables(newClient);
  const newVariables = { ...contract.variables, ...clientVars };

  // U ne-bundle smluv je text zapečený (data-ph spany) - přepečeme client* hodnoty
  // v html, ať se firma změní i v textu (ne jen v metadatech/dynamických klauzulích).
  // U balíčku je text v sekcích (token-forma), html neřešíme.
  const isBundle = Array.isArray(contract.bundleSections) && contract.bundleSections.length > 0;
  let html = contract.html ?? "";
  if (!isBundle) {
    for (const [key, value] of Object.entries(clientVars)) {
      html = setBakedValue(html, key, value);
    }
  }

  await upsertContract({
    ...contract,
    clientId: newClient.id,
    clientName: newClient.companyName,
    variables: newVariables,
    html,
    generatedPdfUrl: undefined,
    generatedPdfPath: undefined,
    generatedAt: undefined,
    updatedAt: new Date().toISOString(),
  });

  const r = getRedis();
  if (r) await r.srem(`portal:contracts:by-client:${contract.clientId}`, CONTRACT_ID);

  console.log(
    `✓ Hotovo: "${contract.clientName}" -> "${newClient.companyName}". PDF zneplatněno (přegeneruj).`,
  );
}

main().catch((err) => {
  console.error("✘ Oprava selhala:", err);
  process.exit(1);
});
