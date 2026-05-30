#!/usr/bin/env tsx
/**
 * Jednorázová oprava: odstraní omylem injektovaný token {{claimsTable}} z html
 * (a templateSnapshot) všech smluv, kam nepatří - tj. všech kromě postoupení
 * pohledávek (claim-assignment, claim-bundle). Příčina byla v contract creation
 * route, kde se ensureClaimsToken volal pro všechny typy; u provozování pak
 * fallback na nadpis „Příloha č. 1..." token vložil.
 *
 * Pusť s DRY=1 (default) pro náhled, DRY=0 pro skutečný zápis.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const DRY = process.env.DRY !== "0";
const KEEP_TYPES = new Set(["claim-assignment", "claim-bundle"]);

function strip(html: string | undefined): string | undefined {
  if (!html) return html;
  return html
    .replace(/<p>\s*\{\{claimsTable\}\}\s*<\/p>/g, "")
    .replace(/\{\{claimsTable\}\}/g, "");
}

async function main() {
  const { listContracts, upsertContract } = await import(
    "../lib/portal/contracts-db"
  );
  const all = await listContracts();
  const affected = all.filter(
    (c) => !KEEP_TYPES.has(c.type) && (c.html ?? "").includes("{{claimsTable}}"),
  );
  console.log(`celkem smluv: ${all.length}, k opravě: ${affected.length}`);

  for (const c of affected) {
    const nextHtml = strip(c.html)!;
    const nextSnapshot = strip((c as any).templateSnapshot);
    console.log(
      `${DRY ? "[DRY]" : "[ZÁPIS]"} ${c.id}  ${c.number ?? ""}  ${c.type}  status=${c.status}`,
    );
    if (DRY) continue;

    const updated: any = { ...c, html: nextHtml };
    if (nextSnapshot !== undefined) updated.templateSnapshot = nextSnapshot;
    await upsertContract(updated);
  }

  if (DRY) console.log("\n— DRY RUN, nic se nezapsalo. Spusť s DRY=0 pro zápis. —");
  else console.log("\n✓ hotovo");
}

main().catch((err) => {
  console.error("✘", err);
  process.exit(1);
});
