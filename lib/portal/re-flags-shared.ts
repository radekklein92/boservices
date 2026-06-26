// ─────────────────────────────────────────────────────────────────────────────
// Uživatelské flagy (barevné štítky) pro lokality - DOMÉNOVÉ typy (client-safe,
// žádný Redis). UI tóny (Tailwind třídy) jsou odděleně v
// components/portal/locations/re-flags-shared.ts, ať lib nezávisí na components.
//
// Flagy jsou sdílené napříč týmem: kdokoli flag vytvoří, vidí ho všichni.
// Katalog (CRUD) žije v lib/portal/re-flags-db, přiřazení k lokalitě v
// LocationLocal.flagIds.
// ─────────────────────────────────────────────────────────────────────────────

export type ReFlagColor =
  | "red"
  | "orange"
  | "amber"
  | "emerald"
  | "teal"
  | "sky"
  | "indigo"
  | "violet"
  | "pink"
  | "zinc";

// Pořadí barev = zdroj pravdy pro zod validaci (color ∈ palety) i pořadí v UI pickeru.
export const FLAG_COLOR_KEYS: ReFlagColor[] = [
  "red",
  "orange",
  "amber",
  "emerald",
  "teal",
  "sky",
  "indigo",
  "violet",
  "pink",
  "zinc",
];

export const DEFAULT_FLAG_COLOR: ReFlagColor = "sky";

// Klíče ikon flagu (doménové, client-safe — žádný import lucide tady). Mapování
// klíč → lucide komponenta drží UI vrstva (components/portal/locations/re-flags-shared).
// Pořadí = pořadí v pickeru. Každý flag nese vlastní ikonu; v tabulce se vedle
// názvu prodejny zobrazí jen ona (label je v tooltipu).
export type ReFlagIcon =
  | "flag"
  | "star"
  | "alert"
  | "bell"
  | "bookmark"
  | "tag"
  | "pin"
  | "building"
  | "store"
  | "key"
  | "lock"
  | "clock"
  | "calendar"
  | "wrench"
  | "hammer"
  | "scale"
  | "coins"
  | "handshake"
  | "phone"
  | "mail"
  | "file"
  | "heart"
  | "zap"
  | "eye";

export const FLAG_ICON_KEYS: ReFlagIcon[] = [
  "flag",
  "star",
  "alert",
  "bell",
  "bookmark",
  "tag",
  "pin",
  "building",
  "store",
  "key",
  "lock",
  "clock",
  "calendar",
  "wrench",
  "hammer",
  "scale",
  "coins",
  "handshake",
  "phone",
  "mail",
  "file",
  "heart",
  "zap",
  "eye",
];

// Default pro starší flagy bez ikony i pro nově rozepsaný flag v pickeru.
export const DEFAULT_FLAG_ICON: ReFlagIcon = "flag";

export interface ReFlag {
  id: string;
  label: string;
  color: ReFlagColor;
  // Vlastní ikona flagu (klíč z FLAG_ICON_KEYS). Starší flagy ji nemají —
  // čtenáři vždy degradují přes DEFAULT_FLAG_ICON.
  icon: ReFlagIcon;
  createdBy: string;
  createdAt: string;
}

export function isReFlagColor(v: unknown): v is ReFlagColor {
  return typeof v === "string" && (FLAG_COLOR_KEYS as string[]).includes(v);
}

export function isReFlagIcon(v: unknown): v is ReFlagIcon {
  return typeof v === "string" && (FLAG_ICON_KEYS as string[]).includes(v);
}
