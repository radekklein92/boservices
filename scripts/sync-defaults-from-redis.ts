#!/usr/bin/env tsx
/**
 * Přepíše tělo HTML funkcí v lib/portal/default-templates.ts aktuálním obsahem
 * z Upstash Redisu. Důsledek: tlačítko „Reset na výchozí" v editoru šablon
 * obnoví právě stav, který je aktuálně uložen v Redisu (tj. co teď v UI vidíš).
 *
 * Použití:
 *   yarn tsx scripts/sync-defaults-from-redis.ts
 *
 * Postup:
 *   1. Pro každý CONTRACT_TYPE (+ variantu) načte HTML z Redisu
 *   2. V default-templates.ts najde příslušnou funkci a přepíše její return
 *      `template literal` čerstvým obsahem.
 */
import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

config({ path: ".env.local" });

const FILE_PATH = resolve("lib/portal/default-templates.ts");

// Mapování (type, variant?) → název funkce v default-templates.ts.
const MAPPING: Array<{
  fn: string;
  type:
    | "franchise"
    | "cooperation"
    | "operation"
    | "withdrawal"
    | "claim-assignment"
    | "side-fee"
    | "assignment-notice";
  variant?: "AB" | "B" | "A";
}> = [
  { fn: "franchiseAbHtml", type: "franchise", variant: "AB" },
  { fn: "franchiseBHtml", type: "franchise", variant: "B" },
  { fn: "cooperationHtml", type: "cooperation" },
  { fn: "operationHtml", type: "operation" },
  { fn: "withdrawalAHtml", type: "withdrawal", variant: "A" },
  { fn: "withdrawalBHtml", type: "withdrawal", variant: "B" },
  { fn: "claimAssignmentHtml", type: "claim-assignment" },
  { fn: "sideFeeHtml", type: "side-fee" },
  { fn: "assignmentNoticeHtml", type: "assignment-notice" },
];

async function main() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    console.error("✘ UPSTASH_REDIS_REST_URL/TOKEN chybí v .env.local");
    process.exit(1);
  }

  const { getContractTemplate } = await import(
    "../lib/portal/contract-templates-db"
  );

  let source = await readFile(FILE_PATH, "utf-8");
  let replaced = 0;

  for (const m of MAPPING) {
    const tpl = await getContractTemplate(m.type as any, m.variant as any);
    if (!tpl) {
      console.log(
        `⏭  ${m.fn} (${m.type}${m.variant ? ":" + m.variant : ""}) — chybí v Redis`,
      );
      continue;
    }

    // Zachovat \r\n citlivost: HTML jak je v Redisu, jen escapovat backticky
    // a ${ pro bezpečné vložení do template literálu.
    const escapedHtml = tpl.html.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

    // Regex najde:  function FN(): string {  return `...`;  }
    // (s libovolnou whitespace mezi tokeny, [\s\S]*? pro HTML obsah)
    const fnRegex = new RegExp(
      `(function\\s+${m.fn}\\(\\):\\s*string\\s*\\{\\s*return\\s*\`)[\\s\\S]*?(\`;\\s*\\})`,
      "m",
    );

    if (!fnRegex.test(source)) {
      console.warn(`⚠  ${m.fn} — funkce nenalezena v ${FILE_PATH}`);
      continue;
    }

    source = source.replace(fnRegex, `$1${escapedHtml}$2`);
    console.log(
      `✓ ${m.fn} (${m.type}${m.variant ? ":" + m.variant : ""}) přepsán (${tpl.html.length} znaků)`,
    );
    replaced++;
  }

  if (replaced > 0) {
    await writeFile(FILE_PATH, source, "utf-8");
    console.log(`\nZapsáno ${replaced} změn do ${FILE_PATH}.`);
  } else {
    console.log("Nic ke změně.");
  }
}

main().catch((err) => {
  console.error("✘ Sync selhal:", err);
  process.exit(1);
});
