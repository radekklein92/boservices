#!/usr/bin/env tsx
/**
 * Jednorázová oprava: u odstoupení přepočítá dynamické klauzule (§1727,
 * depIntroPhrase/depDropPhrase/ksPreservedNote/party-line) podle AKTUÁLNÍ varianty.
 * Řeší smlouvy, kde po přepnutí varianty zůstaly klauzule z původní varianty.
 *
 * Bez --apply jen vypíše before/after (dry-run). Nemění html (klauzule jsou
 * KEEP_DYNAMIC tokeny - mění se jen proměnná). Zneplatní PDF. Jen nepodepsané.
 *
 * Použití: yarn tsx scripts/fix-withdrawal-deps.ts <contractId> [--apply]
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const CONTRACT_ID = process.argv[2];
const APPLY = process.argv.includes("--apply");

async function main() {
  if (!CONTRACT_ID) {
    console.error("✘ Chybí contractId. Použití: ... <contractId> [--apply]");
    process.exit(1);
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("✘ UPSTASH_REDIS_REST_URL/TOKEN chybí v .env.local");
    process.exit(1);
  }

  const { getContract, upsertContract } = await import("../lib/portal/contracts-db");
  const { composeWithdrawalDeps } = await import("../lib/portal/contract-render");

  const c = await getContract(CONTRACT_ID);
  if (!c) throw new Error(`Smlouva ${CONTRACT_ID} nenalezena`);
  if (c.type !== "withdrawal") throw new Error(`Smlouva není odstoupení (${c.type}).`);
  if (c.variables.depIntroPhrase === undefined) {
    throw new Error("Starší šablona bez dynamických klauzulí - neřeším.");
  }
  if (c.signedAt || c.clientSignedAt) throw new Error("Podepsaná smlouva - neřeším.");

  const v = c.variables;
  const variant = c.variant ?? "A";
  const msIncluded = variant === "A" ? true : (v.depIntroPhrase ?? "").includes("(MS)");
  const ksDropped = !(v.ksPreservedNote ?? "").trim();

  const deps = composeWithdrawalDeps(variant, {
    msIncluded,
    ksDropped,
    manager: {
      name: v.managerName,
      ico: v.managerIco,
      street: v.managerStreet,
      city: v.managerCity,
      zip: v.managerZip,
    },
    seller: {
      name: v.sellerName,
      ico: v.sellerIco,
      street: v.sellerStreet,
      city: v.sellerCity,
      zip: v.sellerZip,
    },
  });

  console.log(`Smlouva ${CONTRACT_ID} · varianta ${variant} · msIncluded=${msIncluded} ksDropped=${ksDropped}`);
  console.log("\n--- dependencyClause ---");
  console.log("PŮVODNĚ:", v.dependencyClause);
  console.log("NOVĚ   :", deps.dependencyClause);
  console.log("\n--- depIntroPhrase ---");
  console.log("PŮVODNĚ:", v.depIntroPhrase);
  console.log("NOVĚ   :", deps.depIntroPhrase);

  const changed = Object.entries(deps).some(([k, val]) => v[k] !== val);
  if (!changed) {
    console.log("\n✓ Klauzule už sedí, nic neměním.");
    return;
  }
  if (!APPLY) {
    console.log("\n[dry-run] Spusť s --apply pro provedení.");
    return;
  }

  await upsertContract({
    ...c,
    variables: { ...c.variables, ...deps },
    generatedPdfUrl: undefined,
    generatedPdfPath: undefined,
    generatedAt: undefined,
    updatedAt: new Date().toISOString(),
  });
  console.log("\n✓ Klauzule přepočítány a uloženy. PDF zneplatněno.");
}

main().catch((err) => {
  console.error("✘ Oprava selhala:", err);
  process.exit(1);
});
