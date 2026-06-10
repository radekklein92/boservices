#!/usr/bin/env tsx
/**
 * Jednorázový výpis: všechny franšízingové smlouvy (type=franchise) BEZ
 * přiřazené lokality (locationId). Slouží jako "kde lovit" pro doplnění
 * chybějících lokací u starších smluv, kde se na začátku lokality nezadávaly.
 *
 * Jen čte, nic nemění. Seřazeno: nejdřív podepsané/archivované (priorita -
 * jdou hned dopárovat a chybí v badge/filtru u Lokalit), pak dle data.
 *
 * Použití: npx tsx scripts/list-franchise-without-location.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    console.error("✘ UPSTASH_REDIS_REST_URL/TOKEN chybí v .env.local");
    process.exit(1);
  }

  const { listContracts, statusOrder, CONTRACT_STATUS_LABEL } = await import(
    "../lib/portal/contracts-db"
  );
  const { variantShortLabel } = await import("../lib/portal/contract-types");

  const all = await listContracts();
  const missing = all
    .filter((c) => c.type === "franchise" && !c.locationId)
    .sort(
      (a, b) =>
        statusOrder(b.status) - statusOrder(a.status) ||
        a.createdAt.localeCompare(b.createdAt),
    );

  const signedThreshold = statusOrder("podepsano-klientem");
  const signedCount = missing.filter(
    (c) => statusOrder(c.status) >= signedThreshold,
  ).length;

  if (missing.length === 0) {
    console.log("✔ Všechny franšízingové smlouvy mají přiřazenou lokalitu.");
    return;
  }

  console.log(
    `\nFranšízingové smlouvy BEZ lokality: ${missing.length} ` +
      `(z toho ${signedCount} podepsaných/archivovaných - lze hned dopárovat)\n`,
  );

  const rows = missing.map((c) => ({
    "Č. smlouvy": c.number ?? "-",
    Klient: c.clientName,
    Var: c.variant ? variantShortLabel("franchise", c.variant) : "-",
    Stav: CONTRACT_STATUS_LABEL[c.status],
    Vytvořeno: c.createdAt.slice(0, 10),
    "Odkaz (detail smlouvy)": `/portal/contracts/${c.id}`,
  }));

  console.table(rows);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
