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
    if (contract.html.includes(FRANCHISE_FEE_TOKEN)) {
      return {
        label: "Franšízový a marketingový poplatek",
        value: expected ? `${expected} %` : "neuvedeno",
        changed: false,
      };
    }
    // Placeholder z textu zmizel → klauzule byla upravena ručně.
    const m = contract.html.match(FRANCHISE_FEE_TEXT_RE);
    const inText = m ? m[1]!.trim() : null;
    return {
      label: "Franšízový a marketingový poplatek",
      value: inText ? `${inText} %` : "upraveno v textu",
      changed: true,
      standard: expected ? `${expected} %` : undefined,
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
