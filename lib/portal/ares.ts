export interface AresLookupResult {
  ico: string;
  dic?: string;
  companyName: string;
  legalForm: "PO" | "FO";
  address: {
    street: string;
    city: string;
    zip: string;
    country?: string;
  };
}

type AresAddress = {
  nazevUlice?: string;
  cisloDomovni?: number | string;
  cisloOrientacni?: number | string;
  cisloOrientacniPismeno?: string;
  nazevObce?: string;
  nazevCastiObce?: string;
  psc?: number | string;
  nazevStatu?: string;
};

type AresPayload = {
  ico?: string;
  dic?: string;
  obchodniJmeno?: string;
  pravniForma?: string;
  sidlo?: AresAddress;
  adresaDorucovaci?: AresAddress;
};

const PO_FORMS = new Set([
  "112", // s.r.o.
  "113", // s.r.o.
  "121", // a.s.
  "151", // SE
  "201", // svazek
  "205", // družstvo
  "421", // a.s. (zahr.)
  "423",
  "601",
  "701",
  "751",
  "771",
]);

function legalFormFromCode(code?: string): "PO" | "FO" {
  if (!code) return "PO";
  if (code === "100" || code === "101" || code === "102") return "FO";
  if (PO_FORMS.has(code)) return "PO";
  return code.startsWith("1") ? "PO" : "PO";
}

function composeStreet(addr: AresAddress | undefined): string {
  if (!addr) return "";
  const ulice = addr.nazevUlice?.trim();
  const cisloDom = addr.cisloDomovni ? String(addr.cisloDomovni) : "";
  const cisloOri = addr.cisloOrientacni ? String(addr.cisloOrientacni) : "";
  const pismeno = addr.cisloOrientacniPismeno ?? "";

  const cisloPart = cisloOri
    ? `${cisloDom}/${cisloOri}${pismeno}`
    : `${cisloDom}${pismeno}`;

  if (ulice && cisloPart) return `${ulice} ${cisloPart}`;
  if (ulice) return ulice;
  if (addr.nazevCastiObce && cisloPart) return `${addr.nazevCastiObce} ${cisloPart}`;
  return cisloPart || addr.nazevCastiObce || "";
}

export function normalizeIco(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (!digits.length) return null;
  if (digits.length > 8) return null;
  return digits.padStart(8, "0");
}

export async function lookupAres(rawIco: string): Promise<AresLookupResult | null> {
  const ico = normalizeIco(rawIco);
  if (!ico) return null;

  try {
    const res = await fetch(
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const data: AresPayload = await res.json();
    if (!data?.obchodniJmeno) return null;

    const addr = data.sidlo ?? data.adresaDorucovaci ?? {};
    return {
      ico,
      dic: data.dic,
      companyName: data.obchodniJmeno,
      legalForm: legalFormFromCode(data.pravniForma),
      address: {
        street: composeStreet(addr),
        city: addr.nazevObce?.trim() ?? "",
        zip: String(addr.psc ?? "").trim(),
        country: addr.nazevStatu ?? "Česká republika",
      },
    };
  } catch (err) {
    console.error("[ARES] lookup failed", err);
    return null;
  }
}
