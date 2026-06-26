#!/usr/bin/env tsx
/**
 * Jednorázový import RE dat z Google Sheets (NewCo RE rozpis).
 *
 * Pro každou lokalitu (párováno přes KÓD, case-insensitive):
 *   - "Kdo řeší za RE" → re_agent v Transition (zdroj pravdy), přes public
 *     PATCH /api/public/locations/[id]. Mapování: Roman→Siarik, Lenka→Kholova,
 *     "Někdo jiný"/prázdné → přeskočit. Po úspěchu se aktualizuje i lokální
 *     zrcadlo (setMirroredLocation).
 *   - "Poznámka RE" → lokální poznámka v BOServices (patchLocationLocal),
 *     PŘIPOJENO k případné stávající poznámce (na nový řádek).
 *
 * Použití (vyžaduje nasazený Transition write endpoint):
 *   npx tsx scripts/import-re-sheet.ts          # dry-run (jen vypíše, nic nezapíše)
 *   npx tsx scripts/import-re-sheet.ts --apply  # provede zápis
 *
 * Čte .env.local: UPSTASH_REDIS_REST_*, TRANSITION_LOCATIONS_URL, TRANSITION_API_TOKEN.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

// Surový obsah listu (sloupce: Kód, Název, Koncept, Kategorie, Status,
// Status klienta, Franšízingová smlouva (BOS), Kdo řeší za RE, Status RE,
// Poznámka RE). Řádky jsou zřetězené (kód uvozuje nový záznam).
const RAW = `Data Kód,Název,Koncept,Kategorie,Status,Status klienta,Franšízingová smlouva (BOS),Kdo řeší za RE,Status RE,Poznámka RE CZPH192K,KOP Vypich,KoP,Core,Otevřená,Obsazená,,Roman,Hotovo,Přepsáno na FRA CZCB136K,KoP Géčko České budějovice,KoP,Core,Otevřená,Zadaná,,Někdo jiný,Hotovo,Přepsáno na FRA CZPH272M,MFP Krč,MFP,Core,Otevřená,Obsazená,,Roman,V procesu,Meeting 2.7. CZPR173O,OXO Pardubice,OXO,Core,Otevřená,Obsazená,,Lenka,V procesu, CZPH442T,TK Karlovy lázně,TK,Core,Otevřená,Zadaná,,Někdo jiný,Hotovo,převedeno na Kramperu CZOL496T,Trdlokafe Haná Olomouc,TK,Core,Otevřená,Obsazená,,Lenka,čekáme na instrukce, CZOL010B,BB Olomouc Olympia,BB,Nice,Otevřená,Obsazená,,Roman,Hotovo,Přepsáno na pana Madu CZOV038B,BB Avion 2 Stánek,BB,Nice,Otevřená,Uvolněna,Jelínek?,Roman,V procesu,"muze byt, ale smlouva na FRA + nový koncept (značka)" CZBR001B,BB kralovo pole,BB,Nice,Otevřená,Zadaná,??,Lenka,V procesu,"Řešíme s centrem, aby si frančízant přepsal smlouvu na sebe, nerozhodli se ještě " CZPH133K,KoP Evropská Praha,KoP,Nice,Otevřená,Obsazená,,Lenka,V procesu,převod na BOS CZPL204O,OXO Plzen olympia,OXO,Nice,Otevřená,Obsazená,,Lenka,V procesu,Probíhá VŘ - Krampera SKBA016B,OXO Avion Bratislava,OXO,Nice,Otevřená,Uvolněna,,Roman,V procesu,Francizant jedna o smlouvě CZPH193O,OXO Chodov I,OXO,Nice,Otevřená,Zadaná,,Lenka,, CZPL014B,BB Rokycanská,BB,SoSo,Otevřená,Zadaná,,Lenka,V procesu, CZPH324K,Kop Dukelských hrdinu,KoP,SoSo,Otevřená,Zadaná,,Lenka,Hotovo,nebude CZCB526K,KoP Mariánská České Budějovice,KoP,SoSo,Otevřená,Uvolněna,,Roman,Hotovo,Podepsáno frančízantem. CZPH373K,KoP Prosek Praha,KoP,SoSo,Otevřená,Obsazená,,Roman,Hotovo,Frančízant podepsal smlouvu s pronajímatelem CZPH149K,Kop Chodov Westfield,KoP,SoSo,Otevřená,Obsazená,,Lenka,, CZKO262K,Kop Ovčáry kolín,KoP,SoSo,Otevřená,Obsazená,,Někdo jiný,V procesu,přepis na Eva Kopáčková CZBR575T,TK Starobrněnská Brno,TK,SoSo,Otevřená,Obsazená,,Lenka,V procesu,Resime nového externího nájemce + podnájem frančízantovi CZCB031B,CZ České Budějovice Čtyři Dvory BB,BB,Trash,Otevřená,Zadaná,Mádl?,Lenka,V procesu,"muze byt, ale smlouva na FRA + nový koncept (značka), probíhá jednání" CZPL022B,CZ Plzeň Plaza,BB,Trash,Otevřená,Uvolněna,,Lenka,Hotovo,nebude SKBA002B,Bubblify SK Bratislava Aupark,BB,Trash,Otevřená,Uvolněna,,Roman,V procesu,Řeší Johanesová napřímo CZPH053B,CZ Praha Na Můstku 5,BB,Trash,Otevřená,Prázdná,nic,Roman,V procesu,Potřebuji instrukce CZPH043B,CZ Praha Bořislavka,BB,Trash,Otevřená,Prázdná,ok,Lenka,V procesu,"muze byt, ale smlouva na FRA + nový koncept (značka), probíhá jednání" SKPV003B,Bubblify SK Prešov Eperia,BB,Trash,Otevřená,Prázdná,,Roman,V procesu,Nemáme frančízanta CZPH063B,CZ Praha Fashion Arena,BB,Trash,Otevřená,Uvolněna,,Lenka,Hotovo,výpověď CZOL347K,KoP Olomouc City,KoP,Trash,Otevřená,Uvolněna,,Lenka,V procesu,v procesu přepisu CZOV151K,KoP Ostrava Nová Karolina,KoP,Trash,Otevřená,Zadaná,,Lenka,V procesu,v procesu přepisu CZMI531K,KoP Retail Park Milevsko,KoP,Trash,Otevřená,Uvolněna,,Roman,V procesu,Lokalita muze pokračovat jedině po doplacení frančízantem + přepis CZLN349K,KoP Louny,KoP,Trash,Otevřená,Prázdná,,Roman,Hotovo,Nebude CZPH184K,KoP Butovice,KoP,Trash,Otevřená,Obsazená,,Lenka,V procesu,Probíha jednání s centrem CZCB155K,Kop budějovice nádražní,KoP,Trash,Otevřená,Obsazená,,Lenka,V procesu,v řešení CZPH588K,KoP Malešice,KoP,Trash,Otevřená,Uvolněna,,Roman,V procesu,Lokalita muze pokračovat jedině po doplacení frančízantem + přepis CZTB543K,KoP Třeboň,KoP,Trash,Otevřená,Zadaná,,Lenka,V procesu,Portin - v jednání CZPH544K,KoP Bohnice Praha,KoP,Trash,Otevřená,Obsazená,,Roman,V procesu, CZPH147K,KoP Praha Nuselský pivovar,KoP,Trash,Otevřená,Obsazená,,Lenka,V procesu,"Přepis na FRA, v procesu" CZTR557K,KoP Kaufland Třinec,KoP,Trash,Otevřená,Uvolněna,,Roman,V procesu,"Našli jsme s Markem Labudou variantu, odesláno na Kaufland" CZOL177K,KoP Olomouc 8.kvetna,KoP,Trash,Otevřená,Prázdná,,Roman,Hotovo,"Nebude, NS ukončena pronajímatelem. " CZPH547K,KoP Petynka Praha,KoP,Trash,Otevřená,Uvolněna,,Roman,Hotovo,"Konec, potreba vystehovat" CZZA530K,Zábřeh na Moravě,KoP,Trash,Otevřená,Obsazená,,Lenka,čekáme na instrukce, CZKO145K,KoP Kolín Rorejcova,KoP,Trash,Otevřená,Uvolněna,,Lenka,V procesu, CZBR352K,KoP Kaufland Ponava Brno,KoP,Trash,Otevřená,Zadaná,,Roman,Hotovo,Francizant jedna o smlouvě CZPL191K,KoP Plzeň Americká,KoP,Trash,Otevřená,Zadaná,,Někdo jiný,V procesu,Francizant jedna o smlouvě CZCH351K,KoP Chomutov,KoP,Trash,Otevřená,Uvolněna,,Lenka,Hotovo,"zavřeno, výpověď" CZPH206K,KoP Praha Václavské Náměstí,KoP,Trash,Otevřená,Uvolněna,,Roman,čekáme na instrukce,"Pronajímatel to chtěl vyřešit, ale nenašli jsme frančízanta" CZBE545K,KoP Benešov,KoP,Trash,Otevřená,Uvolněna,,Lenka,čekáme na instrukce,výpověď CZBR153K,KoP Brno Česká,KoP,Trash,Otevřená,Zadaná,,Roman,Hotovo,"V procesu jednání s městem, komisí to prošlo ale čeká se na vyjadreni insolvenčního správce" CZPH158K,KoP Praha Karlín,KoP,Trash,Otevřená,Obsazená,,Lenka,, CZPH623K,Stromovka,KoP,Trash,Otevřená,Uvolněna,,Lenka,V procesu,v jednání CZKV346K,KoP Karlovy Vary Celní,KoP,Trash,Otevřená,Prázdná,,Roman,čekáme na instrukce, CZPH626K,KoP Štefánikova Praha,KoP,Trash,Otevřená,Obsazená,,Lenka,V procesu,"v řešení druhý prostor od MČ, výběrko, současný prostor nepůjde převést" CZBR152K,KoP Brno Hlavní nádraží,KoP,Trash,Otevřená,Obsazená,,Lenka,Hotovo,převedeno na FRA CZKR362K,KoP Kroměříž,KoP,Trash,Otevřená,Obsazená,,Lenka,, CZLI589K,KoP Revoluční Liberec,KoP,Trash,Otevřená,Uvolněna,,Roman,Hotovo,Lokalita ukočena a nebude CZBR269M,CZ Brno Nová Zbrojovka MF,MFP,Trash,Otevřená,Obsazená,,Roman,Hotovo,Přepsáno na FRA SKBA012B,SK Eurovea Bratislava,OXO,Trash,Otevřená,Zadaná,,Roman,V procesu,Francizant jedna o smlouvě SKNI014B,SK Nitra Mlyny Štefánikova třída 61 OXO,OXO,Trash,Otevřená,Prázdná,,Roman,čekáme na instrukce, CZPH273A,CZ Praha Břevnov RAKETOU,RAK,Trash,Otevřená,Obsazená,,Lenka,Hotovo,převedeno na FRA CZPH424T,CZ Zličín II Praha TD,TK,Trash,Otevřená,Obsazená,,Lenka,, CZPH453T,CZ Malostranske namesti TD,TK,Trash,Otevřená,Obsazená,,Někdo jiný,Hotovo,nebude CZPH410T,CZ Novodvorská Praha TD,TK,Trash,Otevřená,Uvolněna,,Lenka,čekáme na instrukce,"výpověď, zatím nemáme FRA" CZZL525T,CZ Centro Zlín TD,TK,Trash,Otevřená,Obsazená,,Lenka,Hotovo,ukončeno CZOV508T,CZ Forum Nová Karolina Ostrava TD,TK,Trash,Otevřená,Uvolněna,,Lenka,V procesu,"v řešení, převod na FRA"`;

// Roman/Lenka = Transition agenti pod křestním jménem; "Někdo jiný" se neimportuje.
const AGENT_MAP: Record<string, string> = { Roman: "Siarik", Lenka: "Kholova" };

// CSV řádek respektující uvozovky (pole s čárkou jsou v "…").
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const CODE_RE = /(?:CZ|SK)[A-Z]{2}\d{3}[A-Z]/;

type Row = { code: string; agentRaw: string; note: string };

function parseRows(): Row[] {
  // Rozsekat na záznamy — každý začíná kódem následovaným čárkou.
  const records = RAW.split(new RegExp(`(?=${CODE_RE.source},)`))
    .map((s) => s.trim())
    .filter((s) => new RegExp(`^${CODE_RE.source},`).test(s));
  return records.map((r) => {
    const cols = parseCsvLine(r);
    return {
      code: (cols[0] ?? "").trim(),
      agentRaw: (cols[7] ?? "").trim(),
      note: (cols[9] ?? "").trim(),
    };
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const txUrl = process.env.TRANSITION_LOCATIONS_URL;
  const txToken = process.env.TRANSITION_API_TOKEN;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("Chybí UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN v .env.local");
    process.exit(1);
  }
  // Transition URL/token jsou potřeba jen pro skutečný zápis agenta (--apply).
  if (apply && (!txUrl || !txToken)) {
    console.error(
      "Pro --apply chybí TRANSITION_LOCATIONS_URL / TRANSITION_API_TOKEN v .env.local.",
    );
    process.exit(1);
  }

  const { listLocations, getLocationLocal, patchLocationLocal, setMirroredLocation } =
    await import("../lib/portal/locations-db");

  const rows = parseRows();
  const locations = await listLocations();
  const byCode = new Map<string, string>();
  for (const l of locations) if (l.code) byCode.set(l.code.trim().toUpperCase(), l.id);

  console.log(`Řádků v tabulce: ${rows.length}. Lokalit v BOServices: ${locations.length}.`);
  console.log(apply ? "Režim: ZÁPIS (--apply)\n" : "Režim: DRY-RUN (bez zápisu; spusť s --apply)\n");

  let agentOk = 0;
  let agentFail = 0;
  let noteOk = 0;
  const unmatched: string[] = [];

  for (const row of rows) {
    const id = byCode.get(row.code.toUpperCase());
    if (!id) {
      unmatched.push(row.code);
      continue;
    }
    const agent = AGENT_MAP[row.agentRaw] ?? null;

    if (agent) {
      if (!apply) {
        agentOk++;
      } else {
        try {
          const res = await fetch(`${txUrl}/${id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${txToken}`,
            },
            body: JSON.stringify({ field: "re_agent", value: agent, actor: "import:google-sheet" }),
          });
          const data = (await res.json().catch(() => null)) as
            | { ok?: boolean; error?: string; location?: { id: string } }
            | null;
          if (res.ok && data?.ok) {
            if (data.location?.id) {
              // setMirroredLocation čeká MirroredLocation — Transition vrací přesně ten tvar.
              await setMirroredLocation(data.location as never);
            }
            agentOk++;
          } else {
            agentFail++;
            console.error(`  ✗ agent ${row.code}: ${data?.error ?? res.status}`);
          }
        } catch (e) {
          agentFail++;
          console.error(`  ✗ agent ${row.code}: ${(e as Error).message}`);
        }
      }
    }

    if (row.note) {
      if (!apply) {
        noteOk++;
      } else {
        const existing = await getLocationLocal(id);
        const prev = existing?.note ?? "";
        const next = prev ? `${prev}\n${row.note}` : row.note;
        if (next !== prev) {
          await patchLocationLocal(id, { note: next }, "import:google-sheet");
          noteOk++;
        }
      }
    }
  }

  console.log(`\nNapárováno: ${rows.length - unmatched.length}/${rows.length}`);
  console.log(`Agent ${apply ? "zapsán" : "k zápisu"}: ${agentOk}${agentFail ? ` (chyb: ${agentFail})` : ""}`);
  console.log(`Poznámka ${apply ? "připojena" : "k připojení"}: ${noteOk}`);
  if (unmatched.length) {
    console.log(`\nNespárované kódy (${unmatched.length}): ${unmatched.join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
