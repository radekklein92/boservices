import https from "node:https";
import type { AresLookupResult } from "./ares";

// Načtení firem z polského a slovenského veřejného rejstříku, normalizované na
// stejný tvar jako ARES (AresLookupResult). Volá se jen ze serveru (kvůli CORS).
//
//  - Polsko: Wykaz podatników VAT (Biała lista, Ministerstvo financí) - hledání
//    podle REGON. Zdarma, bez klíče. Vrací název + jednu adresu jako řetězec.
//  - Slovensko: Register právnických osôb (RPO, Štatistický úrad SR) - hledání
//    podle IČO. Zdarma, veřejné JSON. Vrací strukturovanou adresu.

const TIMEOUT_MS = 9000;

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("[foreign-registers] fetch failed", url, err);
    return null;
  }
}

// ─────────────────────────── Polsko ───────────────────────────

// "ul. Stawy 5, 02-467 Warszawa" -> { street, zip, city }
function parsePolishAddress(raw: string): {
  street: string;
  zip: string;
  city: string;
} {
  const s = (raw ?? "").trim();
  if (!s) return { street: "", zip: "", city: "" };
  const comma = s.indexOf(",");
  const street = (comma >= 0 ? s.slice(0, comma) : s).trim();
  const rest = (comma >= 0 ? s.slice(comma + 1) : "").trim();
  const m = rest.match(/(\d{2}-\d{3})\s*(.*)/);
  if (m) return { street, zip: m[1]!, city: m[2]!.trim() };
  return { street, zip: "", city: rest };
}

// Biała lista vrací adresu i město KAPITÁLKAMI ("STAWY 5", "WARSZAWA"). Převod
// na běžné psaní (první písmeno velké, zbytek malá), s respektem k polským
// uličním zkratkám (ul., al., pl., os. …) a slovům bez písmen (čísla) i pomlčkám.
const PL_LOWER_TOKENS = new Set(["ul.", "al.", "pl.", "os.", "im.", "św.", "gen."]);

function titleCaseToken(token: string): string {
  if (!/\p{L}/u.test(token)) return token; // číslo / "5" / "414/9"
  const lower = token.toLowerCase();
  if (PL_LOWER_TOKENS.has(lower)) return lower;
  return lower
    .split("-")
    .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join("-");
}

function toProperCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(" ");
}

export async function lookupPolishCompany(
  rawRegon: string,
): Promise<AresLookupResult | null> {
  const regon = (rawRegon ?? "").replace(/\s/g, "");
  if (!/^\d{9}(\d{5})?$/.test(regon)) return null;
  const date = new Date().toISOString().slice(0, 10);
  const data = (await fetchJson(
    `https://wl-api.mf.gov.pl/api/search/regon/${regon}?date=${date}`,
  )) as
    | {
        result?: {
          subject?: PolishSubject;
          subjects?: PolishSubject[];
        };
      }
    | null;
  const subject = data?.result?.subject ?? data?.result?.subjects?.[0];
  if (!subject?.name) return null;
  const addr = parsePolishAddress(
    subject.workingAddress || subject.residenceAddress || "",
  );
  return {
    ico: regon,
    dic: subject.nip || undefined,
    companyName: subject.name.trim(),
    legalForm: "PO",
    address: {
      street: toProperCase(addr.street),
      city: toProperCase(addr.city),
      zip: addr.zip,
      country: "Polsko",
    },
  };
}

type PolishSubject = {
  name?: string;
  nip?: string;
  regon?: string;
  residenceAddress?: string;
  workingAddress?: string;
};

// ────────────────────────── Slovensko ─────────────────────────

// Slovenský RPO (api.statistics.sk) aktuálně posílá řetězec certifikátu s
// expirovaným kořenem, který Node (undici) odmítá, ale systém/curl/prohlížeče ho
// tolerují. Uživatel výslovně schválil obejít ověření TLS POUZE pro tento jeden
// veřejný read-only host (žádné přihlašování, výsledek se před uložením kontroluje).
// Scoped na konkrétní hostname; nic jiného se nemění.
const SK_RPO_HOST = "api.statistics.sk";

function slovakGetJson(url: string): Promise<unknown | null> {
  return new Promise((resolve) => {
    const u = new URL(url);
    // Pojistka: tolerantní ověření použít VÝHRADNĚ pro RPO host.
    const rejectUnauthorized = u.hostname !== SK_RPO_HOST;
    const req = https.get(
      url,
      {
        rejectUnauthorized,
        headers: { Accept: "application/json" },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          res.resume();
          resolve(null);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", (e) => {
      console.error("[foreign-registers] SK RPO failed", e);
      resolve(null);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

export async function lookupSlovakCompany(
  rawIco: string,
): Promise<AresLookupResult | null> {
  const ico = (rawIco ?? "").replace(/\D/g, "");
  if (!ico) return null;
  const data = (await slovakGetJson(
    `https://api.statistics.sk/rpo/v1/search?identifier=${ico}`,
  )) as { results?: SlovakEntity[] } | null;
  const entity = data?.results?.[0];
  if (!entity) return null;

  const name = pickCurrent(entity.fullNames)?.value?.trim() ?? "";
  if (!name) return null;

  const a = pickCurrent(entity.addresses);
  const buildingNo = a?.buildingNumber || (a?.regNumber ? String(a.regNumber) : "");
  const street = [a?.street, buildingNo].filter(Boolean).join(" ").trim();
  const city = a?.municipality?.value ?? "";
  const rawZip = (a?.postalCodes?.[0] ?? "").toString().replace(/\s/g, "");
  // Slovenské PSČ "85101" -> "851 01".
  const zip = /^\d{5}$/.test(rawZip) ? `${rawZip.slice(0, 3)} ${rawZip.slice(3)}` : rawZip;

  return {
    ico,
    companyName: name,
    legalForm: "PO",
    address: { street, city, zip, country: "Slovensko" },
  };
}

// RPO vrací jména/adresy jako pole verzí s platností. Bereme aktuální: bez
// validTo (= dosud platná), jinak s nejpozdějším validFrom, jinak první.
function pickCurrent<T extends { validFrom?: string; validTo?: string }>(
  arr: T[] | undefined,
): T | undefined {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const open = arr.filter((x) => !x.validTo);
  const pool = open.length ? open : arr;
  return [...pool].sort((a, b) =>
    (b.validFrom ?? "").localeCompare(a.validFrom ?? ""),
  )[0];
}

type SlovakAddress = {
  validFrom?: string;
  validTo?: string;
  street?: string;
  buildingNumber?: string;
  regNumber?: number | string;
  municipality?: { value?: string };
  postalCodes?: string[];
};

type SlovakEntity = {
  fullNames?: { value?: string; validFrom?: string; validTo?: string }[];
  addresses?: SlovakAddress[];
};
