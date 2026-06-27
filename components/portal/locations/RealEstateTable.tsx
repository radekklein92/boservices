"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Columns3,
  GripVertical,
  MapPin,
  RotateCcw,
  Search,
  Store,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Chip } from "@/components/portal/ui/Chip";
import { FilterChip } from "@/components/portal/ui/FilterChip";
import type { LeaseStatus, ReAgent } from "@/lib/portal/locations-db";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CATEGORY_STYLE,
  RE_AGENT_LABEL,
} from "./locations-shared";
import {
  businessPlanView,
  COLUMN_STORAGE_KEY,
  COLUMN_STORAGE_KEY_LEGACY,
  COLUMNS,
  COLUMNS_BY_ID,
  normalizeColumnOrder,
  normalizeVisibleCols,
  isRedFlagged,
  isRedBucket,
  LEASE_HOLDER_LABEL,
  LEASE_TARGET_SUMMARY,
  RE_AGENT_SUMMARY,
  RE_CHECKIN_META,
  RE_CHECKIN_SORT_WEIGHT,
  RECON_META,
  RECON_ORDER,
  RECON_SORT_WEIGHT,
  reconcile,
  STORE_STATUS_META,
  STORE_STATUS_SORT_WEIGHT,
  type ColumnDef,
  type ColumnId,
  type RealEstateRow,
  type ReconStatus,
  type StoredColumnState,
} from "./real-estate-shared";
import {
  TransitionSelectCell,
  type SelectOption,
  type TransitionField,
} from "./TransitionSelectCell";
import { NoteCell } from "./NoteCell";
import { FlagsCell } from "./FlagsCell";
import { RedFlagCell } from "./RedFlagCell";
import { ReTrendButton } from "./ReTrendButton";
import { ReExcelExportButton } from "./ReExcelExportButton";
import { flagTone } from "./re-flags-shared";
import type { ReFlag } from "@/lib/portal/re-flags-shared";

type Sort = { key: ColumnId; dir: "asc" | "desc" } | null;

// Volby pro editovatelné dropdowny (zdroj pravdy Transition).
const AGENT_OPTIONS: SelectOption[] = (
  ["Krampera", "Siarik", "Kholova", "Gransky", "Neuzil"] as ReAgent[]
).map((a) => ({ value: a, label: RE_AGENT_LABEL[a] }));

const LEASE_OPTIONS: SelectOption[] = (
  [
    "prepis_na_fransizanta",
    "prepis_na_ceip",
    "prepis_jinam",
    "uzavrena_na_twist",
    "nemame_reseni",
    "neznamy",
  ] as LeaseStatus[]
).map((s) => ({ value: s, label: LEASE_HOLDER_LABEL[s] }));

const FLAG_NEUTRAL_TONE = "border-edge bg-edge-warm text-ink-mid";

// Výchozí pohled cílí na "co je potřeba řešit": skryje vyřešené (recon=resolved)
// i lokality označené v NewCo červeně. Obojí jde zase odkrýt chipy níž.
const DEFAULT_RECON: ReconStatus[] = ["needs"];

// `isRedBucket` (samostatná kategorie „Červeně" = nevyřešená červená) žije ve
// sdíleném modulu — stejný predikát používá i týdenní snímek (cron) a graf.

// Projde řádek aktuálním filtrem „stav řešení + Červeně"? Sdílí `filtered`
// i `flagCounts`, ať čísla na chipech sedí s tabulkou.
// - Nevyřešené červené jsou samostatná kategorie: standardně je řídí jen chip
//   „Červeně". Má-li ale taková červená „stejně řešit" (solveDespiteRed), chová
//   se NAVÍC jako Řešit (needs) → projde i přes „Řešit". Pořád projde i přes
//   „Červeně".
// - Vyřešená červená přepadá do Vyřešeno (řídí ji chip „Vyřešeno", ne „Červeně").
// - Nečervené řídí výhradně recon filtr. Prázdný výběr stavů = nic nečerveného
//   (NESMÍ znamenat „zobraz vše", #21).
function passesReconRed(
  r: RealEstateRow,
  reconFilter: Set<ReconStatus>,
  showRed: boolean,
): boolean {
  if (isRedBucket(r)) {
    if (showRed) return true;
    return r.solveDespiteRed && reconFilter.has("needs");
  }
  // Nečervená NEBO vyřešená červená → dle reconu (vyřešená červená do Vyřešeno).
  return reconFilter.has(reconcile(r.leaseCurrent, r.leaseTarget));
}

// Efektivní váha „stavu řešení" pro řazení: vyřešený nájem = Vyřešeno (i u
// červené). Nevyřešená červená s „stejně řešit" = Řešit (needs, nahoru), jinak
// normální recon dle nájmu.
function effectiveReconWeight(r: RealEstateRow): number {
  const rec = reconcile(r.leaseCurrent, r.leaseTarget);
  if (rec === "needs" && isRedFlagged(r) && r.solveDespiteRed) {
    return RECON_SORT_WEIGHT.needs;
  }
  return RECON_SORT_WEIGHT[rec];
}

// Kontext flagů prostrčený do renderCell (jeden objekt místo pěti parametrů).
type FlagCtx = {
  flags: ReFlag[];
  currentUserEmail: string;
  isAdmin: boolean;
  onFlagsApplied: (id: string, flagIds: string[]) => void;
  onCatalogChanged: (next: ReFlag[]) => void;
  onFlagDeleted: (flagId: string) => void;
};

export function RealEstateTable({
  rows,
  flags,
  currentUserEmail,
  isAdmin,
  onFieldApplied,
  onNoteApplied,
  onFlagsApplied,
  onSolveDespiteRedApplied,
  onManualRedApplied,
  onCatalogChanged,
  onFlagDeleted,
}: {
  rows: RealEstateRow[];
  flags: ReFlag[];
  currentUserEmail: string;
  isAdmin: boolean;
  onFieldApplied: (id: string, field: TransitionField, value: string | null) => void;
  onNoteApplied: (id: string, note: string) => void;
  onFlagsApplied: (id: string, flagIds: string[]) => void;
  onSolveDespiteRedApplied: (id: string, value: boolean) => void;
  onManualRedApplied: (id: string, value: boolean) => void;
  onCatalogChanged: (next: ReFlag[]) => void;
  onFlagDeleted: (flagId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [reconFilter, setReconFilter] = useState<Set<ReconStatus>>(
    () => new Set(DEFAULT_RECON),
  );
  // Filtr podle flagů (OR — řádek projde, má-li aspoň jeden z vybraných flagů).
  const [flagFilter, setFlagFilter] = useState<Set<string>>(() => new Set());
  // Defaultně skryté: lokality označené v NewCo červeně (flaggedRed). false = skryté.
  const [showRed, setShowRed] = useState(false);
  const [sort, setSort] = useState<Sort>(null);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement | null>(null);

  // Init z výchozích hodnot (deterministic kvůli hydrataci), pak přepiš z localStorage.
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(
    () => normalizeVisibleCols(undefined),
  );
  const [colOrder, setColOrder] = useState<ColumnId[]>(
    () => normalizeColumnOrder(undefined),
  );
  // Drag jen po posunu o 5px — klik na checkbox/handle nezačne přesun.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    try {
      // Nový formát (v5): pořadí + viditelnost.
      const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredColumnState>;
        setColOrder(normalizeColumnOrder(parsed.order));
        setVisibleCols(normalizeVisibleCols(parsed.visible));
        return;
      }
      // Migrace ze starého v4 (jen viditelnost) — zachová custom sadu, pořadí výchozí.
      const legacy = localStorage.getItem(COLUMN_STORAGE_KEY_LEGACY);
      if (legacy) {
        const ids = JSON.parse(legacy) as ColumnId[];
        setVisibleCols(normalizeVisibleCols(ids));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!colMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!colMenuRef.current?.contains(e.target as Node)) setColMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [colMenuOpen]);

  function persistColState(order: ColumnId[], visible: Set<ColumnId>) {
    try {
      const payload: StoredColumnState = { order, visible: [...visible] };
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  function toggleCol(id: ColumnId) {
    if (COLUMNS_BY_ID.get(id)?.always) return;
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistColState(colOrder, next);
      return next;
    });
  }

  function onColDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setColOrder((prev) => {
      const oldI = prev.indexOf(active.id as ColumnId);
      const newI = prev.indexOf(over.id as ColumnId);
      if (oldI < 0 || newI < 0) return prev;
      const next = arrayMove(prev, oldI, newI);
      persistColState(next, visibleCols);
      return next;
    });
  }

  function resetCols() {
    const order = normalizeColumnOrder(undefined);
    const visible = normalizeVisibleCols(undefined);
    setColOrder(order);
    setVisibleCols(visible);
    try {
      localStorage.removeItem(COLUMN_STORAGE_KEY);
      localStorage.removeItem(COLUMN_STORAGE_KEY_LEGACY);
    } catch {
      /* ignore */
    }
  }

  function toggleRecon(s: ReconStatus) {
    setReconFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleFlag(id: string) {
    setFlagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSort(key: ColumnId) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  const base = useMemo(
    () => (showAll ? rows : rows.filter((r) => r.hasNewco)),
    [rows, showAll],
  );

  // Katalog id → flag (pro labely ve fulltextu i počty u filtrů).
  const flagById = useMemo(() => new Map(flags.map((f) => [f.id, f])), [flags]);

  // Řádky po textovém hledání, ale PŘED facetovými filtry (recon, červené, flagy).
  // Sdílí ho `filtered` i počty na chipech, aby čísla seděla s tabulkou.
  const queried = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => matchesQuery(r, q, flagById));
  }, [base, query, flagById]);

  // Facetové počty: každý chip počítá řádky, které projdou OSTATNÍMI aktivními
  // filtry (a hledáním), ne sebou samým. Červené jsou ale SAMOSTATNÁ kategorie —
  // do Řešit/Vyřešeno se nepočítají vůbec (ani když je „Červeně" zapnuté) a recon
  // filtr se na ně nevztahuje.
  const reconCounts = useMemo(() => {
    const m: Record<ReconStatus, number> = { needs: 0, resolved: 0 };
    for (const r of queried) {
      if (flagFilter.size && !r.flagIds.some((id) => flagFilter.has(id))) continue;
      if (isRedBucket(r)) {
        // Nevyřešená červená = vlastní kategorie mimo recon; výjimka „stejně
        // řešit" se vždy započítá do Řešit (a zůstane i v počtu Červeně níž).
        if (r.solveDespiteRed) m.needs++;
        continue;
      }
      // Nečervená i vyřešená červená → dle reconu (vyřešená červená do Vyřešeno).
      m[reconcile(r.leaseCurrent, r.leaseTarget)]++;
    }
    return m;
  }, [queried, flagFilter]);

  // Červený počet = jen NEVYŘEŠENÉ červené (vyřešené přepadly do Vyřešeno).
  // Respektuje flag filtr; recon je už zohledněn v isRedBucket.
  const redCount = useMemo(() => {
    let n = 0;
    for (const r of queried) {
      if (!isRedBucket(r)) continue;
      if (flagFilter.size && !r.flagIds.some((id) => flagFilter.has(id))) continue;
      n++;
    }
    return n;
  }, [queried, flagFilter]);

  // Počty u flag chipů respektují červenou kategorii + recon filtr (ne flag filtr
  // sebe sama). Červené řádky se započtou jen když je „Červeně" zapnuté a recon
  // filtr se na ně neaplikuje (jsou mimo něj).
  const flagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of queried) {
      if (!passesReconRed(r, reconFilter, showRed)) continue;
      for (const id of r.flagIds) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [queried, showRed, reconFilter]);

  const filtered = useMemo(() => {
    return queried.filter((r) => {
      // Červené = samostatná kategorie (chip „Červeně"); výjimka „stejně řešit"
      // je navíc i v Řešit. Celá logika v passesReconRed (sdílí s flagCounts).
      if (!passesReconRed(r, reconFilter, showRed)) return false;
      // OR mezi vybranými flagy: projde řádek s aspoň jedním z nich.
      if (flagFilter.size && !r.flagIds.some((id) => flagFilter.has(id))) {
        return false;
      }
      return true;
    });
  }, [queried, reconFilter, showRed, flagFilter]);

  // Přehled „Nájem cílově": rozpad PRÁVĚ ZOBRAZENÉ podmnožiny (filtered) podle
  // držitele cílového nájmu — reaguje na hledání i všechny chip filtry
  // (Řešit/Vyřešeno, Červeně, flagy). Každý řádek má právě jeden leaseTarget,
  // takže součet všech dlaždic = filtered.length (= číslo vpravo nad tabulkou).
  const targetCounts = useMemo(() => {
    const m: Record<LeaseStatus, number> = {
      prepis_na_fransizanta: 0,
      prepis_na_ceip: 0,
      prepis_jinam: 0,
      uzavrena_na_twist: 0,
      nemame_reseni: 0,
      neznamy: 0,
    };
    for (const r of filtered) m[r.leaseTarget]++;
    return m;
  }, [filtered]);

  // Přehled „Po agentech": rozpad PRÁVĚ ZOBRAZENÉ podmnožiny (filtered) podle RE
  // agenta — reaguje na hledání i chip filtry stejně jako souhrn nájmu. Zobrazují
  // se jen agenti z RE_AGENT_SUMMARY; ostatní (a lokality bez agenta) se nepočítají
  // do žádné dlaždice, takže součet může být < total.
  const agentCounts = useMemo(() => {
    const m: Record<ReAgent, number> = {
      Krampera: 0,
      Siarik: 0,
      Kholova: 0,
      Gransky: 0,
      Neuzil: 0,
    };
    for (const r of filtered) {
      if (r.reAgent) m[r.reAgent]++;
    }
    return m;
  }, [filtered]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (!sort) {
      // Default: nevyřešené červené až dolů (samostatná kategorie mimo
      // Řešit/Vyřešeno). Výjimka „stejně řešit" je nahoře mezi ostatními needs;
      // vyřešená červená přepadla do Vyřešeno, takže „dolů" se na ni nevztahuje.
      // Uvnitř skupin needs-attention nahoře → název.
      arr.sort((a, b) => {
        const ra = isRedBucket(a) && !a.solveDespiteRed ? 1 : 0;
        const rb = isRedBucket(b) && !b.solveDespiteRed ? 1 : 0;
        if (ra !== rb) return ra - rb;
        const wa = effectiveReconWeight(a);
        const wb = effectiveReconWeight(b);
        if (wa !== wb) return wa - wb;
        return a.name.localeCompare(b.name, "cs");
      });
      return arr;
    }
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      let c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "cs");
      if (c === 0) c = a.name.localeCompare(b.name, "cs");
      return dir === "asc" ? c : -c;
    });
    return arr;
  }, [filtered, sort]);

  // Pořadí i viditelnost řídí uživatel (colOrder + visibleCols). Hlavička i tělo
  // tabulky iterují přes `cols`, takže se přeskupí i překreslí podle nastavení.
  const orderedCols = colOrder
    .map((id) => COLUMNS_BY_ID.get(id))
    .filter((c): c is ColumnDef => !!c);
  const cols = orderedCols.filter((c) => visibleCols.has(c.id));
  // V menu: Lokalita (always) je fixní první kvůli sticky sloupci a nepřesouvá se;
  // ostatní jdou do dnd-kit seznamu (drag pro pořadí + checkbox pro viditelnost).
  const fixedCols = orderedCols.filter((c) => c.always);
  const sortableCols = orderedCols.filter((c) => !c.always);
  const isColsDefault =
    colOrder.every((id, i) => COLUMNS[i]?.id === id) &&
    COLUMNS.every((c) => visibleCols.has(c.id) === (c.defaultVisible || !!c.always));
  // "Zrušit filtr" se ukáže jen když se pohled liší od defaultu (resolved + červené
  // skryté, ostatní viditelné) — reset proto vrací do defaultu, ne do prázdna.
  const reconIsDefault =
    reconFilter.size === DEFAULT_RECON.length &&
    DEFAULT_RECON.every((s) => reconFilter.has(s));
  const isFiltered =
    query.trim() !== "" || showAll || showRed || !reconIsDefault || flagFilter.size > 0;

  const flagCtx: FlagCtx = {
    flags,
    currentUserEmail,
    isAdmin,
    onFlagsApplied,
    onCatalogChanged,
    onFlagDeleted,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Přehledy nad tabulkou — rozpad právě zobrazené podmnožiny (reagují na
          hledání i chip filtry): kam míří nájem cílově a kolik lokalit drží který
          RE agent. Stejný `total` (= zobrazené řádky) v obou, ať jsou procenta
          srovnatelná. */}
      {base.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SummaryCard
            title="Nájem cílově"
            total={filtered.length}
            gridClass="grid-cols-3"
            items={LEASE_TARGET_SUMMARY.map(({ status, label, dot }) => ({
              key: status,
              label,
              dot,
              count: targetCounts[status] ?? 0,
            }))}
          />
          <SummaryCard
            title="Po agentech"
            total={filtered.length}
            gridClass="grid-cols-3"
            items={RE_AGENT_SUMMARY.map(({ agent, dot }) => ({
              key: agent,
              label: RE_AGENT_LABEL[agent],
              dot,
              count: agentCounts[agent],
            }))}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="relative max-w-[400px]">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mid"
          strokeWidth={1.5}
        />
        <input
          type="search"
          placeholder="Hledat podle lokality, agenta, entity, nájmu…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full rounded-full border border-edge bg-paper pl-11 pr-4 text-[14px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
        />
      </div>

      {/* Filtry */}
      <div className="flex flex-wrap items-center gap-2">
        {RECON_ORDER.map((s) => (
          <FilterChip
            key={s}
            active={reconFilter.has(s)}
            onClick={() => toggleRecon(s)}
            dotClass={RECON_META[s].dot}
            label={RECON_META[s].label}
            count={reconCounts[s]}
            title={RECON_META[s].hint}
          />
        ))}

        <FilterChip
          active={showRed}
          onClick={() => setShowRed((v) => !v)}
          dotClass="bg-red-500"
          label="Červeně"
          count={redCount}
          title="Lokality označené v NewCo červeně jsou samostatná kategorie a ve výchozím stavu skryté - kliknutím je zobrazíte. Výjimka: u konkrétní červené lze ve sloupci Červeně zapnout + řešit, takže se ukáže i ve filtru Řešit."
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-edge" aria-hidden="true" />

        <FilterChip
          active={showAll}
          onClick={() => setShowAll((v) => !v)}
          Icon={MapPin}
          label="Zobrazit všechny lokality"
          title="Včetně lokalit, které nejsou v importu NewCo"
        />

        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setReconFilter(new Set(DEFAULT_RECON));
              setShowRed(false);
              setShowAll(false);
              setFlagFilter(new Set());
            }}
            className="ml-1 text-[12px] font-medium text-ink-mid underline-offset-2 hover:text-ink-base hover:underline"
          >
            Zrušit filtr
          </button>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="font-mono text-[12px] text-ink-soft">
            {sorted.length.toString().padStart(2, "0")} / {base.length}
          </span>
          <ReTrendButton />
          <ReExcelExportButton
            className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
            label="Excel"
            iconSize="h-3.5 w-3.5"
          />
          <div className="relative" ref={colMenuRef}>
            <button
              type="button"
              onClick={() => setColMenuOpen((v) => !v)}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft"
            >
              <Columns3 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Sloupce
            </button>
            {colMenuOpen && (
              <div className="absolute right-0 z-40 mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-edge bg-paper py-1 shadow-[0_12px_28px_-12px_rgba(14,14,14,0.3)]">
                <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                    Sloupce
                  </span>
                  <button
                    type="button"
                    onClick={resetCols}
                    disabled={isColsDefault}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-mid transition-colors hover:text-ink-base disabled:cursor-not-allowed disabled:opacity-40"
                    title="Vrátí viditelnost i pořadí sloupců na výchozí"
                  >
                    <RotateCcw className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" />
                    Výchozí
                  </button>
                </div>
                {fixedCols.map((c) => (
                  <div
                    key={c.id}
                    className="flex cursor-not-allowed items-center gap-2 px-3 py-1.5 text-[12.5px] text-ink-soft"
                    title="Lokalitu nelze skrýt ani přesunout"
                  >
                    <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <input
                      type="checkbox"
                      checked
                      disabled
                      className="h-3.5 w-3.5 accent-ink-base"
                    />
                    {c.label}
                  </div>
                ))}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onColDragEnd}
                >
                  <SortableContext
                    items={sortableCols.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {sortableCols.map((c) => (
                      <SortableColumnRow
                        key={c.id}
                        col={c}
                        checked={visibleCols.has(c.id)}
                        onToggle={() => toggleCol(c.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filtr podle flagů (sdílený katalog) */}
      {flags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Flagy
          </span>
          {flags.map((f) => (
            <FilterChip
              key={f.id}
              active={flagFilter.has(f.id)}
              onClick={() => toggleFlag(f.id)}
              dotClass={flagTone(f.color).dot}
              label={f.label}
              count={flagCounts.get(f.id) ?? 0}
              title={`Lokality s flagem „${f.label}"`}
            />
          ))}
        </div>
      )}

      {/* Tabulka / empty */}
      {base.length === 0 ? (
        <EmptyState hasAnyLocations={rows.length > 0} onShowAll={() => setShowAll(true)} />
      ) : (
        <div className="overflow-auto rounded-[24px] border border-edge bg-paper max-h-[calc(100dvh-260px)]">
          <table className="w-full min-w-[1180px] border-collapse text-[13px]">
            <thead>
              <tr>
                {cols.map((c) => {
                  const sortable = c.id !== "note";
                  const isFirst = c.id === "location";
                  const active = sort?.key === c.id;
                  return (
                    <th
                      key={c.id}
                      className={`whitespace-nowrap py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-mid ${
                        isFirst
                          ? "sticky left-0 top-0 z-30 border-r border-edge bg-paper-warm px-2 sm:px-3"
                          : "sticky top-0 z-20 bg-paper-warm px-3"
                      }`}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.id)}
                          className="inline-flex items-center gap-1 uppercase transition-colors hover:text-ink-base"
                        >
                          {c.label}
                          {active ? (
                            sort!.dir === "asc" ? (
                              <ChevronUp className="h-3 w-3" strokeWidth={2} />
                            ) : (
                              <ChevronDown className="h-3 w-3" strokeWidth={2} />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" strokeWidth={2} />
                          )}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  );
                })}
              </tr>
              {/* hairline pod hlavičkou (border-collapse + sticky ji jinak ukrojí) */}
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  className="group border-t border-edge transition-colors hover:bg-paper-warm"
                >
                  {cols.map((c) => {
                    const isFirst = c.id === "location";
                    return (
                      <td
                        key={c.id}
                        className={`py-2 align-middle ${
                          isFirst
                            ? "sticky left-0 z-10 border-r border-edge bg-paper group-hover:bg-paper-warm px-2 sm:px-3"
                            : "px-3"
                        }`}
                      >
                        {renderCell(
                          r,
                          c.id,
                          onFieldApplied,
                          onNoteApplied,
                          onSolveDespiteRedApplied,
                          onManualRedApplied,
                          flagCtx,
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Řádek v menu Sloupce: drag handle (pořadí) + checkbox (viditelnost) ──────

function SortableColumnRow({
  col,
  checked,
  onToggle,
}: {
  col: ColumnDef;
  checked: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-ink-deep ${
        isDragging ? "bg-paper-warm opacity-70" : "hover:bg-paper-warm"
      }`}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none text-ink-soft opacity-40 transition-opacity group-hover:opacity-100"
        {...attributes}
        {...listeners}
        aria-label={`Přetáhnout sloupec ${col.label}`}
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
      <label className="flex flex-1 cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 accent-ink-base"
        />
        {col.label}
      </label>
    </div>
  );
}

// ── Render jedné buňky podle sloupce ─────────────────────────────────────────

function renderCell(
  r: RealEstateRow,
  id: ColumnId,
  onFieldApplied: (id: string, field: TransitionField, value: string | null) => void,
  onNoteApplied: (id: string, note: string) => void,
  onSolveDespiteRedApplied: (id: string, value: boolean) => void,
  onManualRedApplied: (id: string, value: boolean) => void,
  flagCtx: FlagCtx,
) {
  switch (id) {
    case "location":
      // Flagy (FlagsCell) sedí hned vedle názvu jako ikonky s tooltipem —
      // sourozenec Linku (ne uvnitř, aby se proklik na detail nemíchal s
      // otevíráním popoveru flagů). Vlastní sloupec „Flagy" už neexistuje.
      return (
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <Link
            href={`/portal/locations/${r.id}`}
            className="group/loc flex min-w-0 items-center gap-2"
          >
            <span className="flex min-w-0 flex-col">
              <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold tracking-[-0.01em] text-ink-base">
                <span className="max-w-[112px] truncate sm:max-w-[200px]">{r.name}</span>
                <ArrowUpRight
                  className="h-3 w-3 shrink-0 text-ink-soft transition-transform group-hover/loc:-translate-y-0.5 group-hover/loc:translate-x-0.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </span>
              {r.code && (
                <span className="font-mono text-[11px] text-ink-soft">{r.code}</span>
              )}
            </span>
          </Link>
          <FlagsCell
            locationId={r.id}
            flagIds={r.flagIds}
            flags={flagCtx.flags}
            currentUserEmail={flagCtx.currentUserEmail}
            isAdmin={flagCtx.isAdmin}
            onFlagsApplied={flagCtx.onFlagsApplied}
            onCatalogChanged={flagCtx.onCatalogChanged}
            onFlagDeleted={flagCtx.onFlagDeleted}
          />
        </div>
      );
    case "storeStatus": {
      if (!r.locationStatus) return <Dash />;
      const m = STORE_STATUS_META[r.locationStatus];
      return (
        <Chip tone={m.tone} className="whitespace-nowrap">
          {m.label}
        </Chip>
      );
    }
    case "reAgent":
      return (
        <TransitionSelectCell
          id={r.id}
          field="re_agent"
          value={r.reAgent}
          options={AGENT_OPTIONS}
          placeholder="Nepřiřazeno"
          allowClear
          clearLabel="Nepřiřazeno"
          onApplied={(v) => onFieldApplied(r.id, "re_agent", v)}
        />
      );
    case "ceip1":
      return <Txt v={r.newco?.entitaCeip1} />;
    case "ceip2":
      return <Txt v={r.newco?.entitaCeip2} />;
    case "businessPlan": {
      const v = businessPlanView(r.newco?.includeInBusinessPlan);
      return v ? <Chip tone={v.tone}>{v.label}</Chip> : <Dash />;
    }
    case "operationalType":
      return <Txt v={r.newco?.operationalType} />;
    case "category":
      return r.category ? (
        <Chip tone={CATEGORY_STYLE[r.category]} className="whitespace-nowrap">
          {CATEGORY_LABEL[r.category]}
        </Chip>
      ) : (
        <Dash />
      );
    case "flaggedRed":
      // Jediný chip pro všechny stavy: nečervená → nabídne ruční označení;
      // červená z importu (flaggedRed) i ručně (manualRed) → cyklus + řešit,
      // ruční jde navíc zrušit. Ruční se vizuálně odliší od importu (čárkovaný
      // okraj + štítek „ručně"). Vše write-through do BOServices.
      return (
        <RedFlagCell
          id={r.id}
          importRed={Boolean(r.newco?.flaggedRed)}
          manualRed={r.manualRed}
          solveDespiteRed={r.solveDespiteRed}
          hasNewco={Boolean(r.newco)}
          onSolveApplied={(v) => onSolveDespiteRedApplied(r.id, v)}
          onManualRedApplied={(v) => onManualRedApplied(r.id, v)}
        />
      );
    case "franchise":
      return r.franchiseContractId ? (
        <Link
          href={`/portal/contracts/${r.franchiseContractId}`}
          title="Franšízingová smlouva - podepsáno klientem (otevřít smlouvu)"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11.5px] font-medium text-emerald-700 transition-transform hover:-translate-y-0.5"
        >
          <Store className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
          Podepsáno
        </Link>
      ) : (
        <Chip tone={FLAG_NEUTRAL_TONE}>Ne</Chip>
      );
    case "leaseCurrent":
      return (
        <TransitionSelectCell
          id={r.id}
          field="lease_current_status"
          value={r.leaseCurrent}
          options={LEASE_OPTIONS}
          placeholder="—"
          onApplied={(v) => onFieldApplied(r.id, "lease_current_status", v)}
        />
      );
    case "leaseTarget":
      return (
        <TransitionSelectCell
          id={r.id}
          field="lease_target_status"
          value={r.leaseTarget}
          options={LEASE_OPTIONS}
          placeholder="—"
          onApplied={(v) => onFieldApplied(r.id, "lease_target_status", v)}
        />
      );
    case "recon": {
      const s = reconcile(r.leaseCurrent, r.leaseTarget);
      const m = RECON_META[s];
      return (
        <Chip tone={m.tone} className="whitespace-nowrap">
          <m.Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          {m.label}
        </Chip>
      );
    }
    case "reCheckIn": {
      if (!r.reCheckIn) return <Dash />;
      const m = RE_CHECKIN_META[r.reCheckIn.status];
      // Nesoulad: agent hlásí Vyřešeno, ale systémový stav nájmu je pořád Řešit.
      const mismatch =
        r.reCheckIn.status === "resolved" &&
        reconcile(r.leaseCurrent, r.leaseTarget) === "needs";
      const when = new Date(r.reCheckIn.at).toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "numeric",
      });
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Chip tone={m.tone}>{m.label}</Chip>
          <span className="font-mono text-[11px] text-ink-soft">{when}</span>
          {mismatch && (
            <span
              title="Agent hlásí Vyřešeno, ale systémový stav nájmu je pořád Řešit"
              className="inline-flex"
            >
              <AlertTriangle
                className="h-3.5 w-3.5 text-amber-500"
                strokeWidth={2}
                aria-hidden="true"
              />
            </span>
          )}
        </span>
      );
    }
    case "note":
      return (
        <NoteCell id={r.id} value={r.note} onApplied={(note) => onNoteApplied(r.id, note)} />
      );
    default:
      return null;
  }
}

function Txt({ v }: { v: string | null | undefined }) {
  return v && v.trim() ? (
    <span className="whitespace-nowrap text-ink-deep">{v}</span>
  ) : (
    <Dash />
  );
}

function Dash() {
  return <span className="text-ink-soft">—</span>;
}

// ── Souhrnná stat-karta nad tabulkou ─────────────────────────────────────────
// Strategický snímek nad tabulkou (nájem cílově, po agentech): kolik zobrazených
// lokalit padá do které kategorie. Informativní (ne filtr) — vizuálně je to
// stat-karta, ne pill chip, aby bylo jasné, že se nekliká. Procenta se počítají
// proti `total` (= všechny zobrazené řádky); součet dlaždic nemusí dát 100 %,
// pokud karta záměrně neukazuje všechny kategorie.

function locWord(n: number): string {
  if (n === 1) return "lokalita";
  if (n >= 2 && n <= 4) return "lokality";
  return "lokalit";
}

function SummaryCard({
  title,
  total,
  items,
  gridClass,
}: {
  title: string;
  total: number;
  items: ReadonlyArray<{ key: string; label: string; dot: string; count: number }>;
  gridClass: string;
}) {
  return (
    <section className="rounded-[24px] border border-edge bg-paper p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          <span
            aria-hidden="true"
            className="mr-3 inline-block h-px w-6 translate-y-[-3px] bg-ink-base/50 align-middle"
          />
          {title}
        </div>
        <span className="shrink-0 font-mono text-[11px] text-ink-soft">
          {total} {locWord(total)}
        </span>
      </div>
      <div className={`grid gap-x-4 gap-y-5 ${gridClass}`}>
        {items.map(({ key, label, dot, count }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={key} className="flex flex-col">
              <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-mid">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}
                  aria-hidden="true"
                />
                <span className="truncate">{label}</span>
              </span>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span
                  className={`text-[1.7rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums ${
                    count === 0 ? "text-ink-soft" : "text-ink-base"
                  }`}
                >
                  {count}
                </span>
                {count > 0 && (
                  <span className="text-[11px] font-medium text-ink-soft">{pct} %</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Textové hledání nad řádkem ───────────────────────────────────────────────
// `q` je už trimnuté + lowercase (volá se z memoizovaného `queried`).
function matchesQuery(
  r: RealEstateRow,
  q: string,
  flagById: Map<string, ReFlag>,
): boolean {
  const flagLabels = r.flagIds
    .map((id) => flagById.get(id)?.label ?? "")
    .join(" ");
  const hay = [
    r.name,
    r.code,
    r.locationStatus ? STORE_STATUS_META[r.locationStatus].label : "",
    r.reAgent ? RE_AGENT_LABEL[r.reAgent] : "",
    r.newco?.entitaCeip1,
    r.newco?.entitaCeip2,
    r.newco?.operationalType,
    r.category ? CATEGORY_LABEL[r.category] : "",
    r.newco?.includeInBusinessPlan,
    r.franchiseContractId ? "franšíza podepsáno" : "",
    LEASE_HOLDER_LABEL[r.leaseCurrent],
    LEASE_HOLDER_LABEL[r.leaseTarget],
    r.note,
    flagLabels,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

// ── Sort hodnota podle sloupce ───────────────────────────────────────────────

function sortValue(r: RealEstateRow, key: ColumnId): string | number {
  switch (key) {
    case "location":
      return r.name.toLowerCase();
    case "storeStatus":
      // Neznámý stav (null) na konec (asc).
      return r.locationStatus ? STORE_STATUS_SORT_WEIGHT[r.locationStatus] : 99;
    case "reAgent":
      // null agent na konec (asc)
      return r.reAgent ? RE_AGENT_LABEL[r.reAgent].toLowerCase() : "￿";
    case "ceip1":
      return (r.newco?.entitaCeip1 ?? "").toLowerCase();
    case "ceip2":
      return (r.newco?.entitaCeip2 ?? "").toLowerCase();
    case "businessPlan":
      return (r.newco?.includeInBusinessPlan ?? "").toLowerCase();
    case "operationalType":
      return (r.newco?.operationalType ?? "").toLowerCase();
    case "category":
      // Sémantické pořadí core→exit (ne abecedně); null (neznámá) na konec.
      return r.category ? CATEGORY_ORDER.indexOf(r.category) : 99;
    case "flaggedRed":
      return isRedFlagged(r) ? 0 : 1; // červené první (asc)
    case "franchise":
      return r.franchiseContractId ? 0 : 1; // podepsané první (asc)
    case "leaseCurrent":
      return LEASE_HOLDER_LABEL[r.leaseCurrent].toLowerCase();
    case "leaseTarget":
      return LEASE_HOLDER_LABEL[r.leaseTarget].toLowerCase();
    case "recon":
      return RECON_SORT_WEIGHT[reconcile(r.leaseCurrent, r.leaseTarget)];
    case "reCheckIn":
      // Bez hlášení na konec (asc); jinak problém → řeším → vyřešeno.
      return r.reCheckIn ? RE_CHECKIN_SORT_WEIGHT[r.reCheckIn.status] : 99;
    case "note":
      return (r.note ?? "").toLowerCase();
    default:
      return "";
  }
}

function EmptyState({
  hasAnyLocations,
  onShowAll,
}: {
  hasAnyLocations: boolean;
  onShowAll: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-edge bg-paper p-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-edge-warm text-ink-mid">
        <MapPin className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <h3 className="mt-4 text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
        {hasAnyLocations ? "Žádné lokality z importu NewCo" : "Zatím žádné lokality"}
      </h3>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13.5px] text-ink-mid">
        {hasAnyLocations ? (
          <>
            Tabulka ukazuje lokality z importu NewCo. Naimportujte data na stránce{" "}
            <Link href="/portal/locations" className="font-medium text-ink-base underline underline-offset-2">
              Lokality
            </Link>{" "}
            (tlačítko „Import NewCo“), nebo zobrazte všechny lokality.
          </>
        ) : (
          "Lokality se synchronizují z projektu Transition. Po první synchronizaci se zde objeví."
        )}
      </p>
      {hasAnyLocations && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-5 inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-4 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-base"
        >
          <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />
          Zobrazit všechny lokality
        </button>
      )}
    </div>
  );
}
