// Sémantické tóny stavových chipů - JEDINÝ zdroj barev pro stavy/odznaky napříč
// portálem. Barva nese VÝZNAM, ne fázi:
//   neutral = klidový/rozpracováno   info = probíhá / v procesu
//   warn    = čeká na akci / pozor    good = hotovo / pozitivní
//   danger  = problém / zrušeno
// Konkrétní fázi (např. tři mezistavy podpisu) rozlišuje ikona v chipu, ne další
// barva - konec „duhy". Staví na sémantických tokenech z app/globals.css
// (--color-good/info/warn/danger) přes opacity, takže rebrand = jedna změna.
//
// Bydlí v lib/ (ne components/ui), protože je importují i doménové mapy v lib
// (CONTRACT_STATUS_STYLE, PAYOUT_STATUS_STYLE, tasks STATUS_META).

export const TONE_NEUTRAL = "border-edge bg-edge-warm text-ink-mid";
export const TONE_INFO = "border-info/25 bg-info/10 text-info";
export const TONE_WARN = "border-warn/30 bg-warn/10 text-warn";
export const TONE_GOOD = "border-good/25 bg-good/10 text-good";
export const TONE_DANGER = "border-danger/25 bg-danger/10 text-danger";

// Plné barvy teček (FilterChip dot, indikátory u legend).
export const DOT_NEUTRAL = "bg-ink-soft";
export const DOT_INFO = "bg-info";
export const DOT_WARN = "bg-warn";
export const DOT_GOOD = "bg-good";
export const DOT_DANGER = "bg-danger";
