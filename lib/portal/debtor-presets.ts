// Předvyplněný seznam častých dlužníků (sister-companies BOServices).
// IČO + zobrazovaný label; ostatní pole (adresa, DIČ, přesný obchodní název)
// se doplní z ARES při výběru. Pokud se firma přestěhuje, ARES to odráží automaticky.
export interface DebtorPreset {
  ico: string;
  label: string;
}

export const DEBTOR_PRESETS: readonly DebtorPreset[] = [
  { ico: "21530572", label: "Flowers International" },
  { ico: "07862784", label: "Trdlokafe Development 1" },
  { ico: "07177658", label: "Twistcafe" },
  { ico: "17981336", label: "Bubblify International" },
  { ico: "23083646", label: "Pitstop Minimarket" },
  { ico: "05019001", label: "Trdlokafe International" },
  { ico: "21847487", label: "Rio International" },
] as const;

// Další firmy nabízené jako dlužník/ručitel v overlay pohledávek (dashboard),
// které nejsou v DEBTOR_PRESETS (nepotřebují ARES lookup pro smlouvy - jen
// jako textová volba do pickeru). Doplňuje se sem ručně.
export const EXTRA_CLAIM_COMPANIES: readonly string[] = [
  "Twistcafe Group",
  "Kofi Kofi servis s.r.o.",
];
