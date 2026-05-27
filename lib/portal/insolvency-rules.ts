// Společnosti v úpadku: kontrola, zda datum uzavření postoupení není v den
// úpadku nebo po něm. Pokud ano, vzniká pohledávka za majetkovou podstatou
// (zapodstatová pohledávka) - na to upozorní modal (lze ignorovat).
//
// Rozšíření = přidat řádek do INSOLVENCY_RULES (match = podřetězec v názvu
// dlužníka, insolvencyDate = ISO datum úpadku).

export type InsolvencyRule = {
  match: string; // podřetězec v názvu dlužníka (porovnává se lowercase)
  label: string; // název společnosti pro hlášku
  insolvencyDate: string; // ISO YYYY-MM-DD - den úpadku
  insolvencyDateLabel: string; // český zápis pro hlášku
};

export const INSOLVENCY_RULES: InsolvencyRule[] = [
  {
    match: "bubblify",
    label: "Bubblify International",
    insolvencyDate: "2026-05-14",
    insolvencyDateLabel: "14. 5. 2026",
  },
  {
    match: "trdlokafe development 1",
    label: "Trdlokafe Development 1",
    insolvencyDate: "2026-05-22",
    insolvencyDateLabel: "22. 5. 2026",
  },
];

const CZECH_MONTHS: Record<string, number> = {
  ledna: 1,
  února: 2,
  unora: 2,
  března: 3,
  brezna: 3,
  dubna: 4,
  května: 5,
  kvetna: 5,
  června: 6,
  cervna: 6,
  července: 7,
  cervence: 7,
  srpna: 8,
  září: 9,
  zari: 9,
  října: 10,
  rijna: 10,
  listopadu: 11,
  prosince: 12,
};

// Parsuje datum z volného textu: "28. května 2026" i "14.5.2026" / "14. 5. 2026".
export function parseCzechDate(input: string | undefined | null): Date | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();

  const num = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (num) {
    const d = new Date(Number(num[3]), Number(num[2]) - 1, Number(num[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = s.match(/^(\d{1,2})\.\s*(\p{L}+)\s+(\d{4})$/u);
  if (m) {
    const month = CZECH_MONTHS[m[2]!];
    if (month) {
      const d = new Date(Number(m[3]), month - 1, Number(m[1]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

// Vrátí pravidlo, pokud je dlužník v úpadku a datum uzavření je v den úpadku
// nebo po něm (=> zapodstatová pohledávka). Jinak null.
export function checkInsolvency(
  debtorName: string | undefined,
  contractDateText: string | undefined,
): InsolvencyRule | null {
  if (!debtorName || !contractDateText) return null;
  const name = debtorName.toLowerCase();
  const date = parseCzechDate(contractDateText);
  if (!date) return null;

  for (const rule of INSOLVENCY_RULES) {
    if (!name.includes(rule.match)) continue;
    const threshold = new Date(`${rule.insolvencyDate}T00:00:00`);
    if (date.getTime() >= threshold.getTime()) return rule;
  }
  return null;
}
