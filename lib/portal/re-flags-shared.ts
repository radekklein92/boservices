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

export interface ReFlag {
  id: string;
  label: string;
  color: ReFlagColor;
  createdBy: string;
  createdAt: string;
}

export function isReFlagColor(v: unknown): v is ReFlagColor {
  return typeof v === "string" && (FLAG_COLOR_KEYS as string[]).includes(v);
}
