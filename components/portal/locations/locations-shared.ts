import type {
  ClientStatus,
  LandlordAgreement,
  LeaseStatus,
  LocationCategory,
  LocationConcept,
  LocationMode,
  LocationStatus,
  ReAgent,
  TransitionStatus,
} from "@/lib/portal/locations-db";
import { CHIP_CLASS } from "@/components/portal/ui/Chip";

// Labely + chip tóny pro zrcadlené lokality. Hodnoty odpovídají Transition
// (lib/types.ts), tóny jsou přeloženy do BOServices palety (Tailwind utility
// barvy, stejný styl jako stavové chipy u klientů/smluv).

// CHIP_BASE je sjednocený s Chip komponentou (jeden zdroj třídy).
const CHIP = CHIP_CLASS;

export const CATEGORY_LABEL: Record<LocationCategory, string> = {
  core: "Core",
  nice: "Nice",
  soso: "SoSo",
  trash: "Trash",
  exit: "Exit",
};

export const CATEGORY_STYLE: Record<LocationCategory, string> = {
  core: "border-emerald-300 bg-emerald-50 text-emerald-700",
  nice: "border-sky-300 bg-sky-50 text-sky-700",
  soso: "border-amber-300 bg-amber-50 text-amber-700",
  trash: "border-rose-300 bg-rose-50 text-rose-700",
  exit: "border-edge bg-edge-warm text-ink-mid",
};

// Sytá tečka pro filtrovací pilulky - čitelná i na světlé i na černé (aktivní)
// pilulce, drží barevnou identitu kategorie.
export const CATEGORY_DOT: Record<LocationCategory, string> = {
  core: "bg-emerald-500",
  nice: "bg-sky-500",
  soso: "bg-amber-500",
  trash: "bg-rose-500",
  exit: "bg-zinc-400",
};

export const CATEGORY_HINT: Record<LocationCategory, string> = {
  core: "Výhradně na TWIST / CEIP.",
  nice: "Nižší priorita, nájem na franšízanta (jinak TWIST/CEIP).",
  soso: "Smlouva na franšízanta, jinak nabídnout dál.",
  trash: "Provoz v AF, smlouva na franšízanta.",
  exit: "Lokalita odchází z TWIST.",
};

export const CATEGORY_ORDER: LocationCategory[] = [
  "core",
  "nice",
  "soso",
  "trash",
  "exit",
];

export const CONCEPT_LABEL: Record<LocationConcept, string> = {
  TK: "TK",
  KoP: "KoP",
  BB: "BB",
  OXO: "OXO",
  RAK: "RAK",
  VD: "V&D",
  MFP: "MFP",
  KoFi: "Kofi-Kofi",
  Cinname: "Cinname",
  Rio: "Rio",
  Pitstop: "Pitstop",
  other: "Ostatní",
};

export const LEASE_STATUS_LABEL: Record<LeaseStatus, string> = {
  uzavrena_na_twist: "Uzavřena na TWIST",
  prepis_na_fransizanta: "Přepis na franšízanta",
  prepis_jinam: "Přepis jinam",
  prepis_na_ceip: "Přepis na CEIP",
  nemame_reseni: "Nemáme řešení",
  neznamy: "Neznámý",
};

export const TRANSITION_STATUS_LABEL: Record<TransitionStatus, string> = {
  in_progress: "Probíhá",
  hotovo: "Hotovo",
  blocked: "Blokováno",
  not_started: "Nezahájeno",
};

export const TRANSITION_STATUS_STYLE: Record<TransitionStatus, string> = {
  in_progress: "border-amber-300 bg-amber-50 text-amber-700",
  hotovo: "border-emerald-300 bg-emerald-50 text-emerald-700",
  blocked: "border-red-300 bg-red-50 text-red-700",
  not_started: "border-edge bg-edge-warm text-ink-mid",
};

export const RE_AGENT_LABEL: Record<ReAgent, string> = {
  Krampera: "Krampera",
  Siarik: "Šiarik",
  Kholova: "Kholová",
  Gransky: "Granský",
  Neuzil: "Neužil",
};

export const LANDLORD_LABEL: Record<LandlordAgreement, string> = {
  souhlasi: "Souhlasí",
  nesouhlasi: "Nesouhlasí",
  alternative: "Nemožná dohoda",
  resime: "Řešíme",
  zatim_nevime: "Zatím nevíme",
};

export const LOCATION_STATUS_LABEL: Record<LocationStatus, string> = {
  construction: "Ve výstavbě",
  open: "Otevřená",
  closing: "Ke zrušení",
  closed: "Zrušená",
};

export const LOCATION_STATUS_STYLE: Record<LocationStatus, string> = {
  construction: "border-sky-300 bg-sky-50 text-sky-700",
  open: "border-emerald-300 bg-emerald-50 text-emerald-700",
  closing: "border-amber-300 bg-amber-50 text-amber-700",
  closed: "border-red-300 bg-red-50 text-red-700",
};

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  occupied: "Obsazená",
  available: "Uvolněna",
  empty: "Prázdná",
  assigned: "Zadaná",
};

export const MODE_LABEL: Record<LocationMode, string> = {
  franchise: "Aktivní franšíza",
  operations: "Operations mng.",
  full: "Full mng.",
};

export const CHIP_BASE = CHIP;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "kB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
