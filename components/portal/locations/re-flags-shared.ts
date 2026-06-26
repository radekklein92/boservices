// ─────────────────────────────────────────────────────────────────────────────
// UI paleta pro uživatelské flagy (barevné štítky lokalit). Client-safe, drží jen
// barevné TÓNY (Tailwind třídy) - doménové typy (ReFlag, ReFlagColor) jsou v
// lib/portal/re-flags-shared. Vzor FLAG_RED_TONE / RECON_META z real-estate-shared:
// Tailwind purge nevidí dynamicky skládané názvy tříd, takže každý tón je celý
// statický string.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AlertTriangle,
  Bell,
  Bookmark,
  Building2,
  CalendarDays,
  Clock,
  Coins,
  Eye,
  FileText,
  Flag,
  Hammer,
  Handshake,
  Heart,
  Key,
  Lock,
  Mail,
  MapPin,
  Phone,
  Scale,
  Store,
  Tag,
  Wrench,
  Zap,
  Star,
  type LucideIcon,
} from "lucide-react";
import {
  DEFAULT_FLAG_COLOR,
  DEFAULT_FLAG_ICON,
  FLAG_COLOR_KEYS,
  FLAG_ICON_KEYS,
  type ReFlagColor,
  type ReFlagIcon,
} from "@/lib/portal/re-flags-shared";

// Re-export doménových konstant, ať UI importuje paletu, ikony i typy z jednoho místa.
export {
  DEFAULT_FLAG_COLOR,
  DEFAULT_FLAG_ICON,
  FLAG_COLOR_KEYS,
  FLAG_ICON_KEYS,
  type ReFlagColor,
  type ReFlagIcon,
};

// chip = border+bg+text pro pasivní Chip; dot = barevná tečka (filtr, picker);
// text = barva pro icon-only flag vedle názvu prodejny (bez pozadí, jen ikona).
export const FLAG_COLORS: Record<
  ReFlagColor,
  { label: string; chip: string; dot: string; text: string }
> = {
  red: { label: "Červená", chip: "border-red-300 bg-red-50 text-red-700", dot: "bg-red-500", text: "text-red-600" },
  orange: { label: "Oranžová", chip: "border-orange-300 bg-orange-50 text-orange-700", dot: "bg-orange-500", text: "text-orange-600" },
  amber: { label: "Jantarová", chip: "border-amber-300 bg-amber-50 text-amber-700", dot: "bg-amber-500", text: "text-amber-600" },
  emerald: { label: "Zelená", chip: "border-emerald-300 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", text: "text-emerald-600" },
  teal: { label: "Tyrkysová", chip: "border-teal-300 bg-teal-50 text-teal-700", dot: "bg-teal-500", text: "text-teal-600" },
  sky: { label: "Modrá", chip: "border-sky-300 bg-sky-50 text-sky-700", dot: "bg-sky-500", text: "text-sky-600" },
  indigo: { label: "Indigová", chip: "border-indigo-300 bg-indigo-50 text-indigo-700", dot: "bg-indigo-500", text: "text-indigo-600" },
  violet: { label: "Fialová", chip: "border-violet-300 bg-violet-50 text-violet-700", dot: "bg-violet-500", text: "text-violet-600" },
  pink: { label: "Růžová", chip: "border-pink-300 bg-pink-50 text-pink-700", dot: "bg-pink-500", text: "text-pink-600" },
  zinc: { label: "Šedá", chip: "border-zinc-300 bg-zinc-100 text-zinc-700", dot: "bg-zinc-500", text: "text-zinc-600" },
};

// Tón pro flag, jehož barva by nebyla v paletě (degraduje na šedou).
export function flagTone(color: ReFlagColor): { chip: string; dot: string; text: string } {
  const c = FLAG_COLORS[color] ?? FLAG_COLORS.zinc;
  return { chip: c.chip, dot: c.dot, text: c.text };
}

// Re-export pořadí pod UI-přívětivým jménem (iterace v pickeru).
export const FLAG_COLOR_ORDER = FLAG_COLOR_KEYS;

// ── Ikony flagů (klíč → lucide komponenta) ────────────────────────────────────
// Pořadí iterace v pickeru drží FLAG_ICON_KEYS (doménový soubor). Mapa musí mít
// statické názvy komponent, jinak by je Tailwind/treeshake nenašel.
export const FLAG_ICONS: Record<ReFlagIcon, { label: string; Icon: LucideIcon }> = {
  flag: { label: "Vlajka", Icon: Flag },
  star: { label: "Hvězda", Icon: Star },
  alert: { label: "Upozornění", Icon: AlertTriangle },
  bell: { label: "Zvonek", Icon: Bell },
  bookmark: { label: "Záložka", Icon: Bookmark },
  tag: { label: "Štítek", Icon: Tag },
  pin: { label: "Špendlík", Icon: MapPin },
  building: { label: "Budova", Icon: Building2 },
  store: { label: "Prodejna", Icon: Store },
  key: { label: "Klíč", Icon: Key },
  lock: { label: "Zámek", Icon: Lock },
  clock: { label: "Hodiny", Icon: Clock },
  calendar: { label: "Kalendář", Icon: CalendarDays },
  wrench: { label: "Klíč (nářadí)", Icon: Wrench },
  hammer: { label: "Kladivo", Icon: Hammer },
  scale: { label: "Váhy", Icon: Scale },
  coins: { label: "Mince", Icon: Coins },
  handshake: { label: "Podání ruky", Icon: Handshake },
  phone: { label: "Telefon", Icon: Phone },
  mail: { label: "Obálka", Icon: Mail },
  file: { label: "Dokument", Icon: FileText },
  heart: { label: "Srdce", Icon: Heart },
  zap: { label: "Blesk", Icon: Zap },
  eye: { label: "Oko", Icon: Eye },
};

// Komponenta ikony pro flag (degraduje na default, kryje i starší flagy bez ikony).
export function flagIconComp(icon: ReFlagIcon | null | undefined): LucideIcon {
  return (icon && FLAG_ICONS[icon] ? FLAG_ICONS[icon] : FLAG_ICONS[DEFAULT_FLAG_ICON]).Icon;
}
