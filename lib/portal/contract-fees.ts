import type { Contract } from "./contracts-db";

// Odměna / poplatek vytažený z textu smlouvy pro panel „Lokalita a schválení".
// - Franšíza: poplatek je placeholder {{franchiseFeePercent}} navázaný na
//   strukturovanou hodnotu (variables.franchiseFeePercent). „Ručně změněno"
//   = placeholder byl z textu odstraněn (klauzule editována napřímo).
// - Spolupráce a podpora / Provozování provozovny: odměna je natvrdo v textu
//   šablony (15 000 / 30 000 Kč), bez placeholderu. „Změněno" = částka v textu
//   smlouvy se liší od částky ve výchozí (aktivní) šabloně.
//
// Pure funkce (žádný Redis) - bezpečně importovatelné i v client komponentě.

export type ContractFee = {
  // Štítek údaje (Franšízový poplatek / Odměna za provozování).
  label: string;
  // Hodnota k zobrazení (např. „8 %" nebo „15 000 Kč").
  value: string;
  // Liší se od standardu / bylo ručně upraveno v textu.
  changed: boolean;
  // Standardní hodnota (zobrazí se jen když changed = true).
  standard?: string;
};

const FRANCHISE_FEE_TOKEN = "{{franchiseFeePercent}}";

// Procento v editované franšízové klauzuli: „...poplatek ve výši <strong>10 %</strong>".
const FRANCHISE_FEE_TEXT_RE = /poplatek ve výši\s*<strong>\s*([\d.,]+)\s*%/i;

// Částka odměny v Kč: „...odměna ve výši <strong>30 000 Kč</strong>". [^<]{0,40}
// pokryje vmezeřená slova („paušální odměnu ve výši") bez přeskočení do tagu.
const ODMENA_KC_RE =
  /odměn\w*[^<]{0,40}ve výši\s*<strong>\s*([\d \s.]+?)\s*Kč/i;

function normNum(s: string): string {
  return s.replace(/[\s .]/g, "");
}

// Porovná dvě procenta tolerantně (čárka i tečka jako desetinný oddělovač).
function samePercent(a: string, b: string): boolean {
  const na = parseFloat(a.replace(",", "."));
  const nb = parseFloat(b.replace(",", "."));
  return Number.isFinite(na) && Number.isFinite(nb)
    ? na === nb
    : a.trim() === b.trim();
}

// Vytáhne částku odměny (raw, např. „30 000") z HTML šablony nebo smlouvy.
export function extractOdmenaAmount(html: string): string | null {
  const m = html.match(ODMENA_KC_RE);
  return m ? m[1]!.trim() : null;
}

// Naformátuje číselný řetězec na „30 000 Kč" s pevnou mezerou v tisících.
export function formatKc(raw: string): string {
  const digits = normNum(raw);
  if (!digits) return raw;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped} Kč`;
}

// Vrátí poplatek/odměnu pro daný typ smlouvy, nebo null pro typy, kde se údaj
// nesleduje. `standardOperatingFee` = raw částka z aktivní šablony (baseline pro
// cooperation/operation); franšíza ji nepotřebuje (řídí se placeholderem).
export function computeContractFee(
  contract: Contract,
  standardOperatingFee?: string | null,
): ContractFee | null {
  if (contract.type === "franchise") {
    const expected = (contract.variables.franchiseFeePercent ?? "").trim();
    // Hodnota v textu: z placeholderu (nezapečeno), jinak vyčtená z klauzule
    // (zapečeno nebo ručně upraveno). „changed" = liší se od zamýšlené hodnoty
    // ve variables, ne podle přítomnosti tokenu (po zapečení token nikdy není).
    let inText: string | null;
    if (contract.html.includes(FRANCHISE_FEE_TOKEN)) {
      inText = expected || null;
    } else {
      const m = contract.html.match(FRANCHISE_FEE_TEXT_RE);
      inText = m ? m[1]!.trim() : null;
    }
    const changed = !!expected && inText !== null && !samePercent(inText, expected);
    return {
      label: "Franšízový a marketingový poplatek",
      value: inText ? `${inText} %` : expected ? `${expected} %` : "neuvedeno",
      changed,
      standard: changed ? `${expected} %` : undefined,
    };
  }

  if (contract.type === "cooperation" || contract.type === "operation") {
    const current = extractOdmenaAmount(contract.html);
    const baseline = standardOperatingFee?.trim() || null;
    if (!current) {
      return {
        label: "Odměna za provozování",
        value: "nelze určit z textu",
        changed: !!baseline,
        standard: baseline ? formatKc(baseline) : undefined,
      };
    }
    const changed = !!baseline && normNum(current) !== normNum(baseline);
    return {
      label: "Odměna za provozování",
      value: formatKc(current),
      changed,
      standard: changed && baseline ? formatKc(baseline) : undefined,
    };
  }

  return null;
}

// Numerická hodnota franšízového poplatku (%) pro vyhodnocení klíče schválení.
// Bere se z {{franchiseFeePercent}} (variables), a pokud byl placeholder z textu
// odstraněn, zkusí číslo vyčíst z upravené klauzule. null = nelze určit.
export function franchiseFeePercentValue(
  contract: Pick<Contract, "type" | "html" | "variables">,
): number | null {
  if (contract.type !== "franchise") return null;
  if (contract.html.includes(FRANCHISE_FEE_TOKEN)) {
    const v = parseInt((contract.variables.franchiseFeePercent ?? "").trim(), 10);
    return Number.isFinite(v) ? v : null;
  }
  const m = contract.html.match(FRANCHISE_FEE_TEXT_RE);
  if (!m) return null;
  const v = parseFloat(m[1]!.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

// Numerická výše odměny (Kč) pro vyhodnocení klíče schválení (cooperation /
// operation). null = z textu nelze určit.
export function operatingFeeAmountValue(
  contract: Pick<Contract, "type" | "html">,
): number | null {
  if (contract.type !== "cooperation" && contract.type !== "operation") {
    return null;
  }
  const raw = extractOdmenaAmount(contract.html);
  if (!raw) return null;
  const v = parseInt(normNum(raw), 10);
  return Number.isFinite(v) ? v : null;
}
