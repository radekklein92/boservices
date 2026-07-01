// Sémantické tóny stavových chipů - JEDINÝ zdroj barev pro stavy/odznaky napříč
// portálem. Barva nese VÝZNAM, ne fázi:
//   neutral = klidový/rozpracováno   info = probíhá / v procesu
//   warn    = čeká na akci / pozor    good = hotovo / pozitivní
//   danger  = problém / zrušeno
// Konkrétní fázi (např. tři mezistavy podpisu) rozlišuje ikona v chipu, ne další
// barva - konec „duhy". Každá role má tři tokeny ve stejné sytosti jako Tailwind
// škála (base -700 text / tint -50 pozadí / edge -300 obrys) v app/globals.css,
// takže chipy jsou ŽIVÉ (ne vybledlé). NEpoužívat opacity (bg-good/10) - míchání
// s bílou desaturuje. Rebrand = změna tokenů na jednom místě.
//
// Bydlí v lib/ (ne components/ui), protože je importují i doménové mapy v lib
// (CONTRACT_STATUS_STYLE, PAYOUT_STATUS_STYLE, tasks STATUS_META).

export const TONE_NEUTRAL = "border-edge bg-edge-warm text-ink-mid";
export const TONE_INFO = "border-info-edge bg-info-tint text-info";
export const TONE_WARN = "border-warn-edge bg-warn-tint text-warn";
export const TONE_GOOD = "border-good-edge bg-good-tint text-good";
export const TONE_DANGER = "border-danger-edge bg-danger-tint text-danger";

// Plné barvy teček (FilterChip dot, indikátory u legend).
export const DOT_NEUTRAL = "bg-ink-soft";
export const DOT_INFO = "bg-info";
export const DOT_WARN = "bg-warn";
export const DOT_GOOD = "bg-good";
export const DOT_DANGER = "bg-danger";
