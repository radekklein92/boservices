#!/usr/bin/env tsx
/**
 * Jednorázové naplnění účetních středisek (POHODA "Seznam středisek", 30.6.2026)
 * do lokálních dat lokalit (LocationLocal.accountingCenter).
 *
 * Párování je RUČNÍ - tabulka níž mapuje zkratku střediska na KÓD lokality
 * (schváleno uživatelem 2.7.2026, vč. rozhodnutí sporných případů):
 *   - CZ001KOKY "Kytky Kolín,Ovčáry"  → KoP Kolín Rorejcova (CZKO145K, otevřená)
 *   - CZ014PHKY "Dukelských hrdinů"   → Kop Dukelských hrdinu (CZPH324K, i když zavřená)
 *   - PL001KRTK "Krakow,Florianska"   → TK Floriańska 15 Kraków (PLKR005T)
 *   - CZVELKOOB "Velkobchod"          → bez provozovny, nepřiřazuje se (není v tabulce)
 *
 * Použití:
 *   npx tsx scripts/import-accounting-centers.ts          # dry-run (jen vypíše)
 *   npx tsx scripts/import-accounting-centers.ts --apply  # provede zápis
 *
 * Čte .env.local: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

// středisko (zkratka POHODA) | popis v POHODĚ | kód lokality v portálu
const MAPPING: Array<{ center: string; popis: string; locationCode: string }> = [
  { center: "CZ001BRBB", popis: "Bubblify Brno,Královo Pole", locationCode: "CZBR001B" },
  { center: "CZ001BRTK", popis: "Trdlokafe Brno,Campus Square", locationCode: "CZBR464T" },
  { center: "CZ001CBKY", popis: "Kytky České Budějovice,Roudné", locationCode: "CZCB249K" },
  { center: "CZ001KOKY", popis: "Kytky Kolín,Ovčáry", locationCode: "CZKO145K" },
  { center: "CZ001LBKY", popis: "Kytky Liberec,Plaza", locationCode: "CZLB141K" },
  { center: "CZ001OLTK", popis: "Trdlokafe Olomouc,Šantovka", locationCode: "CZOL495T" },
  { center: "CZ001OSBB", popis: "Bubblify Ostrava,Nová Karolína", locationCode: "CZOV039B" },
  { center: "CZ001PAKY", popis: "Kytky Pardubice", locationCode: "CZPA399K" },
  { center: "CZ001PHKY", popis: "Kytky Praha,DBK Budějovická", locationCode: "CZPH135K" },
  { center: "CZ001PHTK", popis: "Trdlokafe Praha,Karlova", locationCode: "CZPH409T" },
  { center: "CZ001PLBB", popis: "Bubblify Plzeň,Rokycanská", locationCode: "CZPL014B" },
  { center: "CZ001TEKY", popis: "Kytky Teplice,Olympia", locationCode: "CZTP333K" },
  { center: "CZ002BRBB", popis: "Bubblify Brno,Campus", locationCode: "CZBR015B" },
  { center: "CZ002BRTK", popis: "Trdlokafe Brno,Olympia", locationCode: "CZBR462T" },
  { center: "CZ002CBKY", popis: "Kytky České Budějovice,Mariánská", locationCode: "CZCB526K" },
  { center: "CZ002LBKY", popis: "Kytky Liberec,Géčko", locationCode: "CZLB156K" },
  { center: "CZ002PHKY", popis: "Kytky Praha,Masaryčka", locationCode: "CZPH130K" },
  { center: "CZ002PHTK", popis: "Trdlokafe Praha,Václavské nám.", locationCode: "CZPH455T" },
  { center: "CZ003BRBB", popis: "Bubblify Brno,Česká", locationCode: "CZBR007B" },
  { center: "CZ003BRTK", popis: "Trdlokafe Brno II,Olympia BUS", locationCode: "CZBR473T" },
  { center: "CZ003CBKY", popis: "Kytky České Budějovice,Nádražní", locationCode: "CZCB155K" },
  { center: "CZ003PHKY", popis: "Kytky Praha,Anděl", locationCode: "CZPH126K" },
  { center: "CZ003PHTK", popis: "Trdlokafe Praha,Na Můstku", locationCode: "CZPH450T" },
  { center: "CZ004CBKY", popis: "Kytky České Budějovice,OC 4dvor", locationCode: "CZCB154K" },
  { center: "CZ004PHKY", popis: "Kytky Praha,Centrum Černý Most", locationCode: "CZPH150K" },
  { center: "CZ004PHTK", popis: "Trdlokafe Praha,Malé náměstí", locationCode: "CZPH439T" },
  { center: "CZ005PHKY", popis: "Kytky Praha,Moskevská", locationCode: "CZPH171K" },
  { center: "CZ005PHTK", popis: "Trdlokafe Praha,Nerudova", locationCode: "CZPH438T" },
  { center: "CZ006PHKY", popis: "Kytky Praha,Vysočanská metro", locationCode: "CZPH251K" },
  { center: "CZ007PHKY", popis: "Kytky Praha,Kaprova", locationCode: "CZPH129K" },
  { center: "CZ008PHKY", popis: "Kytky Praha,Seifertova", locationCode: "CZPH325K" },
  { center: "CZ009PHKY", popis: "Kytky Praha,OCCíl zahradní město", locationCode: "CZPH264K" },
  { center: "CZ010PHKY", popis: "Kytky Praha,Lužiny", locationCode: "CZPH621K" },
  { center: "CZ011PHKY", popis: "Kytky Praha,Florentinum", locationCode: "CZPH137K" },
  { center: "CZ012PHKY", popis: "Kytky Praha,Paprsek Stodůlky", locationCode: "CZPH637K" },
  { center: "CZ013PHKY", popis: "Kytky Praha,Nuselský pivovar", locationCode: "CZPH147K" },
  { center: "CZ014PHKY", popis: "Kytky Praha,Dukelských hrdinů", locationCode: "CZPH324K" },
  { center: "PL001KRTK", popis: "Trdlokafe Krakow,Florianska", locationCode: "PLKR005T" },
  { center: "PL002KRTR", popis: "Trdlokafe Krakow,Slawkowska", locationCode: "PLKR003T" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const { listLocations, patchLocationLocal, getLocationLocal } = await import(
    "../lib/portal/locations-db"
  );

  const locations = await listLocations();
  const byCode = new Map(
    locations
      .filter((l) => l.code)
      .map((l) => [l.code!.trim().toUpperCase(), l] as const),
  );

  let set = 0;
  let same = 0;
  let overwritten = 0;
  const unmatched: string[] = [];

  for (const m of MAPPING) {
    const loc = byCode.get(m.locationCode.toUpperCase());
    if (!loc) {
      unmatched.push(`${m.center} → ${m.locationCode} (${m.popis})`);
      continue;
    }
    const local = await getLocationLocal(loc.id);
    const current = local?.accountingCenter?.trim() ?? "";
    if (current === m.center) {
      same++;
      console.log(`= ${m.center}  ${loc.code}  ${loc.name} (beze změny)`);
      continue;
    }
    const tag = current ? `PŘEPIS "${current}" → ` : "";
    console.log(`+ ${m.center}  ${loc.code}  ${loc.name}  ${tag}[${loc.location_status ?? "?"}]`);
    if (current) overwritten++;
    set++;
    if (apply) {
      await patchLocationLocal(
        loc.id,
        { accountingCenter: m.center },
        "import:pohoda-strediska",
      );
    }
  }

  console.log("");
  console.log(`Celkem v mapování: ${MAPPING.length}`);
  console.log(`${apply ? "Zapsáno" : "K zápisu (dry-run)"}: ${set} (z toho přepisů: ${overwritten})`);
  console.log(`Beze změny: ${same}`);
  if (unmatched.length) {
    console.log(`NENAPÁROVÁNO (${unmatched.length}):`);
    for (const u of unmatched) console.log(`  ! ${u}`);
  }
  if (!apply) console.log('\nDry-run - pro zápis spusť s "--apply".');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
