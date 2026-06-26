import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  type LucideIcon,
} from "lucide-react";
import type {
  LeaseStatus,
  LocationNewCo,
  ReAgent,
} from "@/lib/portal/locations-db";

// ─────────────────────────────────────────────────────────────────────────────
// Sdílené (server↔klient) typy a labely pro Real Estate tabulku. Soubor je
// client-safe: z datové vrstvy se berou jen TYPY (`import type`), žádný runtime
// kód (Redis). Labely držitele nájmu se sem ZÁMĚRNĚ duplikují místo importu
// z contract-approval.ts — ten žije v modulu se server-only kódem.
// ─────────────────────────────────────────────────────────────────────────────

// Jeden řádek tabulky. Sestavuje ho server (page.tsx) z MirroredLocation +
// lokálních dat; přes RSC boundary jdou jen plain objekty (žádná Map).
export type RealEstateRow = {
  id: string;
  name: string;
  code: string | null;
  hasNewco: boolean;
  newco: LocationNewCo | null;
  note: string;
  // RE agent z Transition (zdroj pravdy). Edituje se write-through do Transition.
  reAgent: ReAgent | null;
  leaseCurrent: LeaseStatus;
  leaseTarget: LeaseStatus;
  // Id podepsané franšízingové smlouvy (status „podepsáno klientem"+ vč. DigiSign
  // mezistavu, bez zrušených) — null = lokalita ji nemá. Stejný zdroj jako badge
  // „franšíza" na stránce Lokality (listLocationFranchiseContracts).
  franchiseContractId: string | null;
};

// ── Stav řešení nájmu (porovnání aktuální vs cílový) ──────────────────────────

export type ReconStatus = "resolved" | "needs" | "unclear";

// Cíl, který není konkrétní → nelze říct, jestli je hotovo.
const VAGUE_TARGET: ReadonlySet<LeaseStatus> = new Set<LeaseStatus>([
  "neznamy",
  "nemame_reseni",
]);

// - unclear: cíl není určený (testuje se PRVNÍ — kryje i current=target=neznamy)
// - needs: aktuální === TWIST → vždy je co řešit (přepsat jinam), i kdyby se to
//   shodovalo s cílem — TWIST je tranzitní entita, ne přípustný cílový stav
// - resolved: aktuální === cílový a cíl je konkrétní → hotovo, nemakat
// - needs: aktuální !== cílový → je co řešit, makat
export function reconcile(current: LeaseStatus, target: LeaseStatus): ReconStatus {
  if (VAGUE_TARGET.has(target)) return "unclear";
  if (current === "uzavrena_na_twist") return "needs";
  if (current === target) return "resolved";
  return "needs";
}

export const RECON_META: Record<
  ReconStatus,
  { label: string; tone: string; dot: string; Icon: LucideIcon; hint: string }
> = {
  needs: {
    label: "Řešit",
    tone: "border-amber-300 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
    Icon: AlertTriangle,
    hint: "Aktuální nájem se liší od cílového — je co řešit.",
  },
  resolved: {
    label: "Vyřešeno",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    Icon: CheckCircle2,
    hint: "Aktuální nájem už odpovídá cílovému.",
  },
  unclear: {
    label: "Cíl nejasný",
    tone: "border-edge bg-edge-warm text-ink-mid",
    dot: "bg-zinc-400",
    Icon: CircleDashed,
    hint: "Cílový stav nájmu není určený (neznámý / nemáme řešení).",
  },
};

// Pořadí pro filtrovací chipy i default sort (needs-attention first).
export const RECON_ORDER: ReconStatus[] = ["needs", "unclear", "resolved"];
export const RECON_SORT_WEIGHT: Record<ReconStatus, number> = {
  needs: 0,
  unclear: 1,
  resolved: 2,
};

// ── Krátké labely "na koho je nájem" (sloupce Nájem aktuálně/cílově) ──────────
// Zrcadlí LEASE_HOLDER_LABEL z contract-approval.ts (client-safe kopie).
export const LEASE_HOLDER_LABEL: Record<LeaseStatus, string> = {
  prepis_na_fransizanta: "na franšízanta",
  prepis_na_ceip: "na BOS",
  prepis_jinam: "na třetí stranu",
  uzavrena_na_twist: "na TWIST",
  nemame_reseni: "nevyřešeno",
  neznamy: "neznámé",
};

// ── V business plánu (Y/N) — hodnota je volný string z NewCo Excelu ──────────
const BP_YES = new Set(["Y", "YES", "ANO", "A", "TRUE", "1"]);
const BP_NO = new Set(["N", "NO", "NE", "FALSE", "0"]);

export function businessPlanView(
  raw: string | null | undefined,
): { label: string; tone: string } | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const u = v.toUpperCase();
  if (BP_YES.has(u)) return { label: "Ano", tone: "border-edge bg-paper text-ink-deep" };
  if (BP_NO.has(u)) return { label: "Ne", tone: "border-edge bg-edge-warm text-ink-soft" };
  return { label: v, tone: "border-edge bg-paper text-ink-deep" };
}

// ── Sloupce (pro přepínání viditelnosti) ──────────────────────────────────────

export type ColumnId =
  | "location"
  | "reAgent"
  | "ceip1"
  | "ceip2"
  | "businessPlan"
  | "operationalType"
  | "category"
  | "flaggedRed"
  | "franchise"
  | "leaseCurrent"
  | "leaseTarget"
  | "recon"
  | "note";

export type ColumnDef = {
  id: ColumnId;
  label: string;
  defaultVisible: boolean;
  // Lokalita se nedá skrýt (identita řádku, sticky první sloupec).
  always?: boolean;
};

export const COLUMNS: ColumnDef[] = [
  { id: "location", label: "Lokalita", defaultVisible: true, always: true },
  { id: "reAgent", label: "RE agent", defaultVisible: true },
  { id: "ceip1", label: "Entita CEIP 1", defaultVisible: true },
  { id: "ceip2", label: "Entita CEIP 2", defaultVisible: false },
  { id: "businessPlan", label: "Business plán", defaultVisible: true },
  { id: "operationalType", label: "Operational type", defaultVisible: true },
  { id: "category", label: "Kategorie", defaultVisible: false },
  { id: "flaggedRed", label: "Červeně", defaultVisible: true },
  { id: "franchise", label: "Franšíza", defaultVisible: true },
  { id: "leaseCurrent", label: "Nájem aktuálně", defaultVisible: true },
  { id: "leaseTarget", label: "Nájem cílově", defaultVisible: true },
  { id: "recon", label: "Stav řešení", defaultVisible: true },
  { id: "note", label: "Poznámka", defaultVisible: true },
];

export const COLUMN_STORAGE_KEY = "re-table-cols-v1";
