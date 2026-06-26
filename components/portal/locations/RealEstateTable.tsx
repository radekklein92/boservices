"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Columns3,
  FileSpreadsheet,
  Loader2,
  MapPin,
  Search,
  Store,
} from "lucide-react";
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
  COLUMNS,
  LEASE_HOLDER_LABEL,
  LEASE_TARGET_SUMMARY,
  RECON_META,
  RECON_ORDER,
  RECON_SORT_WEIGHT,
  reconcile,
  STORE_STATUS_META,
  STORE_STATUS_SORT_WEIGHT,
  type ColumnId,
  type RealEstateRow,
  type ReconStatus,
} from "./real-estate-shared";
import {
  TransitionSelectCell,
  type SelectOption,
  type TransitionField,
} from "./TransitionSelectCell";
import { NoteCell } from "./NoteCell";
import { FlagsCell } from "./FlagsCell";
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

const FLAG_RED_TONE = "border-red-300 bg-red-50 text-red-700";
const FLAG_NEUTRAL_TONE = "border-edge bg-edge-warm text-ink-mid";

// Výchozí pohled cílí na "co je potřeba řešit": skryje vyřešené (recon=resolved)
// i lokality označené v NewCo červeně. Obojí jde zase odkrýt chipy níž.
const DEFAULT_RECON: ReconStatus[] = ["needs"];

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
  const [exporting, setExporting] = useState(false);

  // Init z defaultVisible (deterministic kvůli hydrataci), pak přepiš z localStorage.
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(
    () => new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)),
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (!raw) return;
      const ids = JSON.parse(raw) as ColumnId[];
      const valid = new Set(COLUMNS.map((c) => c.id));
      const next = new Set(ids.filter((i) => valid.has(i)));
      COLUMNS.forEach((c) => {
        if (c.always) next.add(c.id);
      });
      if (next.size) setVisibleCols(next);
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

  function toggleCol(id: ColumnId) {
    setVisibleCols((prev) => {
      const col = COLUMNS.find((c) => c.id === id);
      if (col?.always) return prev;
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
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
      if (r.newco?.flaggedRed) continue; // červené = vlastní kategorie, mimo recon
      if (flagFilter.size && !r.flagIds.some((id) => flagFilter.has(id))) continue;
      m[reconcile(r.leaseCurrent, r.leaseTarget)]++;
    }
    return m;
  }, [queried, flagFilter]);

  // Červený počet respektuje jen flag filtr (ne recon — červené stojí mimo něj).
  const redCount = useMemo(() => {
    let n = 0;
    for (const r of queried) {
      if (!r.newco?.flaggedRed) continue;
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
      if (r.newco?.flaggedRed) {
        if (!showRed) continue;
      } else if (!reconFilter.has(reconcile(r.leaseCurrent, r.leaseTarget))) {
        // Stejné pravidlo jako ve `filtered`: prázdný výběr stavů = nic nečerveného.
        continue;
      }
      for (const id of r.flagIds) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [queried, showRed, reconFilter]);

  const filtered = useMemo(() => {
    return queried.filter((r) => {
      if (r.newco?.flaggedRed) {
        // Červené = samostatná kategorie: řídí je výhradně chip „Červeně",
        // recon filtr (Řešit/Vyřešeno) se na ně nevztahuje.
        if (!showRed) return false;
      } else if (!reconFilter.has(reconcile(r.leaseCurrent, r.leaseTarget))) {
        // Žádný vybraný stav = žádné nečervené řádky. Prázdný výběr NESMÍ
        // znamenat „zobraz vše" (odznačení Řešit jinak vrátilo i vyřešené).
        return false;
      }
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

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (!sort) {
      // Default: červené až dolů (samostatná kategorie mimo Řešit/Vyřešeno),
      // uvnitř každé skupiny needs-attention nahoře → název.
      arr.sort((a, b) => {
        const ra = a.newco?.flaggedRed ? 1 : 0;
        const rb = b.newco?.flaggedRed ? 1 : 0;
        if (ra !== rb) return ra - rb;
        const wa = RECON_SORT_WEIGHT[reconcile(a.leaseCurrent, a.leaseTarget)];
        const wb = RECON_SORT_WEIGHT[reconcile(b.leaseCurrent, b.leaseTarget)];
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

  // Export do .xlsx přesně toho, co je vidět (sorted = po filtru + řazení).
  // buildRealEstateXlsx (a s ním JSZip) se natáhne lazy až při kliknutí.
  async function exportXlsx() {
    if (exporting || sorted.length === 0) return;
    setExporting(true);
    try {
      const { buildRealEstateXlsx } = await import("./real-estate-export");
      const flagLabelById = new Map(flags.map((f) => [f.id, f.label]));
      const bytes = await buildRealEstateXlsx(sorted, flagLabelById);
      // Kopie do Uint8Array nad plain ArrayBuffer - JSZip typuje buffer jako
      // ArrayBufferLike (i SharedArrayBuffer), což BlobPart nepřijme.
      const blob = new Blob([new Uint8Array(bytes)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (ASCII)
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `real-estate-${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[real-estate] XLSX export selhal", err);
    } finally {
      setExporting(false);
    }
  }

  const cols = COLUMNS.filter((c) => visibleCols.has(c.id));
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
      {/* Přehled „Nájem cílově" — rozpad právě zobrazené podmnožiny (reaguje
          na hledání i chip filtry) nad tabulkou. */}
      {base.length > 0 && (
        <LeaseTargetSummary counts={targetCounts} total={filtered.length} />
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
          title="Lokality označené v NewCo červeně jsou samostatná kategorie (nepočítají se do Řešit ani Vyřešeno) a ve výchozím stavu skryté — kliknutím je zobrazíte."
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
          <button
            type="button"
            onClick={exportXlsx}
            disabled={exporting || sorted.length === 0}
            title="Stáhne zobrazené řádky (po filtru) do Excelu (.xlsx)"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            )}
            Excel
          </button>
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
              <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-edge bg-paper py-1 shadow-[0_12px_28px_-12px_rgba(14,14,14,0.3)]">
                {COLUMNS.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] transition-colors ${
                      c.always
                        ? "cursor-not-allowed text-ink-soft"
                        : "cursor-pointer text-ink-deep hover:bg-paper-warm"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.has(c.id)}
                      disabled={c.always}
                      onChange={() => toggleCol(c.id)}
                      className="h-3.5 w-3.5 accent-ink-base"
                    />
                    {c.label}
                  </label>
                ))}
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
                  const sortable = c.id !== "note" && c.id !== "flags";
                  const isFirst = c.id === "location";
                  const active = sort?.key === c.id;
                  return (
                    <th
                      key={c.id}
                      className={`whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-mid ${
                        isFirst
                          ? "sticky left-0 top-0 z-30 border-r border-edge bg-paper"
                          : "sticky top-0 z-20 bg-paper"
                      }`}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.id)}
                          className="inline-flex items-center gap-1 transition-colors hover:text-ink-base"
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
                        className={`px-3 py-2 align-middle ${
                          isFirst
                            ? "sticky left-0 z-10 border-r border-edge bg-paper group-hover:bg-paper-warm"
                            : ""
                        }`}
                      >
                        {renderCell(r, c.id, onFieldApplied, onNoteApplied, flagCtx)}
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

// ── Render jedné buňky podle sloupce ─────────────────────────────────────────

function renderCell(
  r: RealEstateRow,
  id: ColumnId,
  onFieldApplied: (id: string, field: TransitionField, value: string | null) => void,
  onNoteApplied: (id: string, note: string) => void,
  flagCtx: FlagCtx,
) {
  switch (id) {
    case "location":
      return (
        <Link
          href={`/portal/locations/${r.id}`}
          className="group/loc flex items-center gap-2"
        >
          <span className="flex flex-col">
            <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold tracking-[-0.01em] text-ink-base">
              <span className="max-w-[200px] truncate">{r.name}</span>
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
    case "flags":
      return (
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
      return r.newco ? (
        <Chip tone={r.newco.flaggedRed ? FLAG_RED_TONE : FLAG_NEUTRAL_TONE}>
          {r.newco.flaggedRed ? "Ano" : "Ne"}
        </Chip>
      ) : (
        <Dash />
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

// ── Přehled „Nájem cílově" ───────────────────────────────────────────────────
// Strategický snímek nad tabulkou: kolik lokalit míří nájmem cílově na koho.
// Informativní (ne filtr) — vizuálně je to stat-karta, ne pill chip, aby bylo
// jasné, že se nekliká. Součet dlaždic = total (každý řádek právě jeden cíl).

function locWord(n: number): string {
  if (n === 1) return "lokalita";
  if (n >= 2 && n <= 4) return "lokality";
  return "lokalit";
}

function LeaseTargetSummary({
  counts,
  total,
}: {
  counts: Record<LeaseStatus, number>;
  total: number;
}) {
  return (
    <section className="rounded-[24px] border border-edge bg-paper p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          <span
            aria-hidden="true"
            className="mr-3 inline-block h-px w-6 translate-y-[-3px] bg-ink-base/50 align-middle"
          />
          Nájem cílově
        </div>
        <span className="shrink-0 font-mono text-[11px] text-ink-soft">
          {total} {locWord(total)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {LEASE_TARGET_SUMMARY.map(({ status, label, dot }) => {
          const n = counts[status] ?? 0;
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          return (
            <div key={status} className="flex flex-col">
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
                    n === 0 ? "text-ink-soft" : "text-ink-base"
                  }`}
                >
                  {n}
                </span>
                {n > 0 && (
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
      return r.newco?.flaggedRed ? 0 : 1; // červené první (asc)
    case "franchise":
      return r.franchiseContractId ? 0 : 1; // podepsané první (asc)
    case "leaseCurrent":
      return LEASE_HOLDER_LABEL[r.leaseCurrent].toLowerCase();
    case "leaseTarget":
      return LEASE_HOLDER_LABEL[r.leaseTarget].toLowerCase();
    case "recon":
      return RECON_SORT_WEIGHT[reconcile(r.leaseCurrent, r.leaseTarget)];
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
