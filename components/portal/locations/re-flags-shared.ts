// ─────────────────────────────────────────────────────────────────────────────
// UI paleta pro uživatelské flagy (barevné štítky lokalit). Client-safe, drží jen
// barevné TÓNY (Tailwind třídy) - doménové typy (ReFlag, ReFlagColor) jsou v
// lib/portal/re-flags-shared. Vzor FLAG_RED_TONE / RECON_META z real-estate-shared:
// Tailwind purge nevidí dynamicky skládané názvy tříd, takže každý tón je celý
// statický string.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_FLAG_COLOR,
  FLAG_COLOR_KEYS,
  type ReFlagColor,
} from "@/lib/portal/re-flags-shared";

// Re-export doménových konstant, ať UI importuje paletu i typy z jednoho místa.
export { DEFAULT_FLAG_COLOR, FLAG_COLOR_KEYS, type ReFlagColor };

// chip = border+bg+text pro pasivní Chip; dot = barevná tečka (filtr, picker).
export const FLAG_COLORS: Record<ReFlagColor, { label: string; chip: string; dot: string }> = {
  red: { label: "Červená", chip: "border-red-300 bg-red-50 text-red-700", dot: "bg-red-500" },
  orange: { label: "Oranžová", chip: "border-orange-300 bg-orange-50 text-orange-700", dot: "bg-orange-500" },
  amber: { label: "Jantarová", chip: "border-amber-300 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  emerald: { label: "Zelená", chip: "border-emerald-300 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  teal: { label: "Tyrkysová", chip: "border-teal-300 bg-teal-50 text-teal-700", dot: "bg-teal-500" },
  sky: { label: "Modrá", chip: "border-sky-300 bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  indigo: { label: "Indigová", chip: "border-indigo-300 bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
  violet: { label: "Fialová", chip: "border-violet-300 bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  pink: { label: "Růžová", chip: "border-pink-300 bg-pink-50 text-pink-700", dot: "bg-pink-500" },
  zinc: { label: "Šedá", chip: "border-zinc-300 bg-zinc-100 text-zinc-700", dot: "bg-zinc-500" },
};

// Tón pro flag, jehož barva by nebyla v paletě (degraduje na šedou).
export function flagTone(color: ReFlagColor): { chip: string; dot: string } {
  const c = FLAG_COLORS[color] ?? FLAG_COLORS.zinc;
  return { chip: c.chip, dot: c.dot };
}

// Re-export pořadí pod UI-přívětivým jménem (iterace v pickeru).
export const FLAG_COLOR_ORDER = FLAG_COLOR_KEYS;
