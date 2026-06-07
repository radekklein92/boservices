// Zkrácení rozepsaných právních forem v názvu firmy na běžné zkratky. Rejstříky
// (hlavně polská Biała lista) vrací plný tvar "SPÓŁKA Z OGRANICZONĄ
// ODPOWIEDZIALNOŚCIĄ" - zkrátíme na "sp. z o.o.". Bezpečné i pro názvy, které
// už zkratku mají (no-op). Case-insensitive, tolerantní k diakritice.

const RULES: [RegExp, string][] = [
  // Polsko (delší fráze první)
  [/spó[łl]ka z ograniczon[aą] odpowiedzialno[śs]ci[aą]/giu, "sp. z o.o."],
  [/spó[łl]ka komandytowo-akcyjna/giu, "S.K.A."],
  [/spó[łl]ka komandytowa/giu, "sp.k."],
  [/spó[łl]ka jawna/giu, "sp.j."],
  [/spó[łl]ka partnerska/giu, "sp.p."],
  [/spó[łl]ka akcyjna/giu, "S.A."],
  // Slovensko / Česko
  [/spolo[čc]nos[ťt] s ru[čc]en[íi]m obmedzen[ýy]m/giu, "s.r.o."],
  [/spole[čc]nost s ru[čc]en[íi]m omezen[ýy]m/giu, "s.r.o."],
  [/akciová spolo[čc]nos[ťt]/giu, "a.s."],
  [/akciová spole[čc]nost/giu, "a.s."],
  // Německo / mezinárodní
  [/gesellschaft mit beschränkter haftung/giu, "GmbH"],
];

export function abbreviateLegalForm(name: string): string {
  let out = (name ?? "").trim();
  for (const [re, abbr] of RULES) out = out.replace(re, abbr);
  // Úklid: vícenásobné mezery, mezera před čárkou, koncové čárky/mezery.
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/[,\s]+$/g, "")
    .trim();
}
