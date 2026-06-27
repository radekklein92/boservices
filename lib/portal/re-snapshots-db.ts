import { getRedis } from "@/lib/redis";
import { listLocations, listLocationLocalMap } from "./locations-db";
import { computeReconCounts, type ReconCounts } from "@/components/portal/locations/real-estate-shared";

// ─────────────────────────────────────────────────────────────────────────────
// Týdenní snímky počtů kategorií Real Estate (Řešit / Vyřešeno / Červeně) pro graf
// „Vývoj v čase". Cron /api/cron/re-trend-snapshot zaznamená každé pondělí počty
// za PRÁVĚ UPLYNULÝ týden (bod v grafu dosedne na neděli toho týdne). Aktuální
// (rozdělaný) týden se v grafu kreslí jako ŽIVÝ bod počítaný realtime — do Redisu
// se uloží až příští pondělí, takže se nikdy nepřekrývá s uloženými snímky.
//
// Počty se počítají přesně jako chipy nad tabulkou (computeReconCounts ze sdílené
// vrstvy) nad podmnožinou „v importu NewCo" (stejné jako výchozí pohled tabulky),
// takže živý bod sedí 1:1 s číslem, které uživatel vidí na stránce.
// ─────────────────────────────────────────────────────────────────────────────

export type ReSnapshot = {
  // ISO 8601 týden, např. "2026-W26". Klíč v Redis mapě (idempotentní upsert).
  weekKey: string;
  // Poslední den týdne (neděle), ISO datum "YYYY-MM-DD" — kam bod v grafu dosedne.
  weekEnd: string;
  needs: number;
  resolved: number;
  red: number;
  // Kdy se snímek pořídil (ISO čas).
  capturedAt: string;
};

const KEY = "portal:re-snapshots";

// ── ISO týden (UTC) ──────────────────────────────────────────────────────────
// Počítá se nad UTC částmi data. Cron běží v 01:00 UTC v pondělí — bezpečně mimo
// půlnoční hrany, takže UTC vs Europe/Prague tu nehraje roli.

// Pondělí 00:00 UTC týdne, do kterého `d` spadá.
function startOfIsoWeekUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Po=0 … Ne=6
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

// "YYYY-MM-DD" z UTC částí.
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ISO rok+týden (week 1 = týden s prvním čtvrtkem v roce).
function isoYearWeek(d: Date): { year: number; week: number } {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Po=0 … Ne=6
  x.setUTCDate(x.getUTCDate() - dow + 3); // čtvrtek tohoto týdne
  const firstThursday = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  const ftDow = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDow + 3);
  const week =
    1 + Math.round((x.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return { year: x.getUTCFullYear(), week };
}

function weekKeyOf(d: Date): string {
  const { year, week } = isoYearWeek(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// Neděle (poslední den) týdne, do kterého `d` spadá.
function weekEndOf(d: Date): string {
  const sunday = new Date(startOfIsoWeekUTC(d).getTime() + 6 * 86_400_000);
  return isoDate(sunday);
}

// Metadata aktuálního (rozdělaného) týdne — pro živý bod grafu.
export function currentWeekMeta(now: Date): { weekKey: string; weekEnd: string } {
  return { weekKey: weekKeyOf(now), weekEnd: weekEndOf(now) };
}

// Metadata právě UPLYNULÉHO týdne — pro pondělní cron. Jde o týden těsně před tím,
// do kterého `now` spadá (= týden minulé neděle), nezávisle na přesném čase běhu.
export function lastEndedWeekMeta(now: Date): { weekKey: string; weekEnd: string } {
  const prevSunday = new Date(startOfIsoWeekUTC(now).getTime() - 86_400_000);
  return { weekKey: weekKeyOf(prevSunday), weekEnd: isoDate(prevSunday) };
}

// ── Redis I/O ────────────────────────────────────────────────────────────────
// Vše drženo pod jedním klíčem jako mapa weekKey → snímek (stejný get/set vzor
// jako zbytek locations-db; objem je drobný — desítky týdnů ročně).

function byWeekEnd(a: ReSnapshot, b: ReSnapshot): number {
  return a.weekEnd.localeCompare(b.weekEnd);
}

export async function getReSnapshots(): Promise<ReSnapshot[]> {
  const r = getRedis();
  if (!r) return [];
  const map = (await r.get<Record<string, ReSnapshot>>(KEY)) ?? {};
  return Object.values(map).sort(byWeekEnd);
}

// Idempotentní upsert snímku za daný týden (re-run cronu týž týden přepíše,
// nevznikne duplicita). Read-modify-write — zápisy jsou jen pondělní (cron).
export async function saveReSnapshot(snap: ReSnapshot): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  const map = (await r.get<Record<string, ReSnapshot>>(KEY)) ?? {};
  map[snap.weekKey] = snap;
  await r.set(KEY, map);
}

// ── Živé počty (realtime) ─────────────────────────────────────────────────────
// Stejná podmnožina jako výchozí pohled tabulky: lokality „v importu NewCo".
// Počítá se sdíleným computeReconCounts → čísla sedí s chipy nad tabulkou.
export async function computeCurrentReconCounts(): Promise<ReconCounts> {
  const [locations, localMap] = await Promise.all([
    listLocations(),
    listLocationLocalMap(),
  ]);
  const rows = locations
    .map((l) => ({ l, local: localMap.get(l.id) }))
    .filter(({ local }) => Boolean(local?.newco))
    .map(({ l, local }) => ({
      newco: local!.newco ?? null,
      manualRed: local!.manualRed ?? null,
      solveDespiteRed: local!.solveDespiteRed ?? false,
      leaseCurrent: l.lease_current_status,
      leaseTarget: l.lease_target_status,
    }));
  return computeReconCounts(rows);
}

// Živý snímek aktuálního týdne (do grafu jako poslední, „rozdělaný" bod).
export async function buildLiveSnapshot(now: Date): Promise<ReSnapshot> {
  const { weekKey, weekEnd } = currentWeekMeta(now);
  const counts = await computeCurrentReconCounts();
  return { weekKey, weekEnd, ...counts, capturedAt: now.toISOString() };
}

// ── Body pro graf ─────────────────────────────────────────────────────────────
// Uložené týdny (BEZ aktuálního — ten řídí výhradně živý bod, ať se nezdvojí) +
// živý bod jako poslední, seřazeno dle weekEnd vzestupně. Sdíleno API routou
// (modal na Real Estate) i kartou na Dashboardu (server-side).
export type ReTrendPoint = ReSnapshot & { live: boolean };

export async function buildReTrendPoints(now: Date): Promise<ReTrendPoint[]> {
  const [snapshots, live] = await Promise.all([
    getReSnapshots(),
    buildLiveSnapshot(now),
  ]);
  const { weekKey } = currentWeekMeta(now);
  const recorded = snapshots.filter((s) => s.weekKey !== weekKey);
  return [
    ...recorded.map((s) => ({ ...s, live: false })),
    { ...live, live: true },
  ].sort((a, b) => a.weekEnd.localeCompare(b.weekEnd));
}
