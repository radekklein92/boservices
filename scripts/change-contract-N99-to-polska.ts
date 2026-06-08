#!/usr/bin/env tsx
/**
 * Jednorázová ruční oprava: u smlouvy N99OLO1Wk2p7 (claim-bundle 2026/281)
 * srovná firmu z "BRYSTAN PRO s.r.o." na "BRYSTAN POLSKA sp. z o.o.".
 *
 * Text balíčku už má Brystan Polska vepsanou ručně; tady jen dorovnáváme
 * METADATA smlouvy (clientId, clientName) a client* proměnné, ať je smlouva
 * konzistentní (hlavička, fakta, by-client index, PDF).
 *
 * Smlouva NENÍ podepsaná (signedAt/clientSignedAt = null), takže zneplatníme
 * vygenerované PDF, aby se přegenerovalo s Brystan Polska. Status se nemění.
 *
 * Záloha původní smlouvy do /tmp. Použití: yarn tsx scripts/change-contract-N99-to-polska.ts
 */
import { config } from "dotenv";
import { writeFile } from "node:fs/promises";

config({ path: ".env.local" });

const CONTRACT_ID = "N99OLO1Wk2p7";
const NEW_CLIENT_ID = "2uhXYJZK1PEX"; // BRYSTAN POLSKA sp. z o.o.
const OLD_CLIENT_ID = "vXzOqACxtwjX"; // BRYSTAN PRO s.r.o.

async function main() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("✘ UPSTASH_REDIS_REST_URL/TOKEN chybí v .env.local");
    process.exit(1);
  }

  const { getRedis } = await import("../lib/redis");
  const { getContract, upsertContract } = await import("../lib/portal/contracts-db");
  const { getClient } = await import("../lib/portal/clients-db");
  const { buildClientVariables } = await import("../lib/portal/contract-render");

  const contract = await getContract(CONTRACT_ID);
  const newClient = await getClient(NEW_CLIENT_ID);
  if (!contract) throw new Error(`Smlouva ${CONTRACT_ID} nenalezena`);
  if (!newClient) throw new Error(`Klient ${NEW_CLIENT_ID} nenalezen`);

  if (contract.signedAt || contract.clientSignedAt) {
    throw new Error("Smlouva už je podepsaná - ruční změnu firmy nedělám.");
  }
  if (contract.clientId === NEW_CLIENT_ID) {
    console.log("✓ Už nastaveno na Brystan Polska, nic neměním.");
    return;
  }

  // Záloha
  const backupPath = `/tmp/contract-${CONTRACT_ID}-backup-${Date.now()}.json`;
  await writeFile(backupPath, JSON.stringify(contract, null, 2), "utf-8");
  console.log(`💾 Záloha původní smlouvy: ${backupPath}`);

  const newVariables = {
    ...contract.variables,
    ...buildClientVariables(newClient),
  };

  console.log(
    `Měním firmu: "${contract.clientName}" (${contract.clientId}) -> "${newClient.companyName}" (${newClient.id})`,
  );

  await upsertContract({
    ...contract,
    clientId: newClient.id,
    clientName: newClient.companyName,
    variables: newVariables,
    // Stale PDF -> zneplatnit (přegeneruje se s Brystan Polska).
    generatedPdfUrl: undefined,
    generatedPdfPath: undefined,
    generatedAt: undefined,
    updatedAt: new Date().toISOString(),
  });

  // upsertContract udělá SADD na nový by-client index; starý je potřeba uklidit.
  const r = getRedis();
  if (r) {
    await r.srem(`portal:contracts:by-client:${OLD_CLIENT_ID}`, CONTRACT_ID);
  }

  console.log("✓ Hotovo. clientName, clientId i client* proměnné jsou teď Brystan Polska.");
  console.log("  Pozn.: vygenerované PDF bylo zneplatněno - před odesláním ho přegeneruj.");
}

main().catch((err) => {
  console.error("✘ Oprava selhala:", err);
  process.exit(1);
});
