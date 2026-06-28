"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, MapPin, FileCheck, FileX, Store } from "lucide-react";
import type { LocationCategory, MirroredLocation } from "@/lib/portal/locations-db";
import { FilterChip } from "@/components/portal/ui/FilterChip";
import { BTN_ROW } from "@/components/portal/ui/buttons";
import {
  CATEGORY_DOT,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CATEGORY_STYLE,
  CHIP_BASE,
  CLIENT_STATUS_LABEL,
  CONCEPT_LABEL,
  LOCATION_STATUS_LABEL,
  LOCATION_STATUS_STYLE,
} from "./locations-shared";

type LeaseFilter = "all" | "has" | "missing";

export function LocationsTable({
  locations,
  withContractIds = [],
  franchiseByLocation = {},
}: {
  locations: MirroredLocation[];
  // Id lokalit s nahranou přílohou (nájemní smlouvou).
  withContractIds?: string[];
  // Mapa locationId -> id podepsané franšízingové smlouvy.
  franchiseByLocation?: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [activeCats, setActiveCats] = useState<Set<LocationCategory>>(new Set());
  const [leaseFilter, setLeaseFilter] = useState<LeaseFilter>("all");
  const [franchiseFilter, setFranchiseFilter] = useState<LeaseFilter>("all");

  const withContract = useMemo(
    () => new Set(withContractIds),
    [withContractIds],
  );

  const counts = useMemo(() => {
    const map = new Map<LocationCategory, number>();
    for (const l of locations) {
      if (l.category) map.set(l.category, (map.get(l.category) ?? 0) + 1);
    }
    return map;
  }, [locations]);

  const leaseCounts = useMemo(() => {
    let has = 0;
    for (const l of locations) if (withContract.has(l.id)) has++;
    return { has, missing: locations.length - has };
  }, [locations, withContract]);

  const franchiseCounts = useMemo(() => {
    let has = 0;
    for (const l of locations) if (franchiseByLocation[l.id]) has++;
    return { has, missing: locations.length - has };
  }, [locations, franchiseByLocation]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations.filter((l) => {
      if (activeCats.size > 0 && (!l.category || !activeCats.has(l.category))) {
        return false;
      }
      if (leaseFilter === "has" && !withContract.has(l.id)) return false;
      if (leaseFilter === "missing" && withContract.has(l.id)) return false;
      const hasFranchise = Boolean(franchiseByLocation[l.id]);
      if (franchiseFilter === "has" && !hasFranchise) return false;
      if (franchiseFilter === "missing" && hasFranchise) return false;
      if (!q) return true;
      const haystack = [
        l.name,
        l.code,
        CONCEPT_LABEL[l.concept],
        l.current_client_name,
        l.new_client_name,
        l.target_franchisee,
        l.client_ico,
        l.responsible,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    locations,
    query,
    activeCats,
    leaseFilter,
    withContract,
    franchiseFilter,
    franchiseByLocation,
  ]);

  function toggleCat(cat: LocationCategory) {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  if (locations.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-edge bg-paper p-12 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-edge-warm text-ink-mid">
          <MapPin className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <h3 className="mt-4 text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
          Zatím žádné lokality.
        </h3>
        <p className="mx-auto mt-2 max-w-[44ch] text-[13.5px] text-ink-mid">
          Lokality se synchronizují z projektu Transition. Po nastavení integrace
          a první synchronizaci se zde objeví.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-[400px] flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mid"
            strokeWidth={1.5}
          />
          <input
            type="search"
            placeholder="Hledat podle názvu, kódu, klienta…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full rounded-full border border-edge bg-paper pl-11 pr-4 text-[14px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
          />
        </div>
        <span className="font-mono text-[12px] text-ink-soft">
          {filtered.length.toString().padStart(2, "0")} / {locations.length}
        </span>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {CATEGORY_ORDER.map((cat) => {
          const n = counts.get(cat) ?? 0;
          if (n === 0) return null;
          return (
            <FilterChip
              key={cat}
              active={activeCats.has(cat)}
              onClick={() => toggleCat(cat)}
              dotClass={CATEGORY_DOT[cat]}
              label={CATEGORY_LABEL[cat]}
              count={n}
            />
          );
        })}

        <span className="mx-1 h-5 w-px shrink-0 bg-edge" aria-hidden="true" />

        <FilterChip
          active={leaseFilter === "has"}
          onClick={() => setLeaseFilter((f) => (f === "has" ? "all" : "has"))}
          Icon={FileCheck}
          label="S nájemní smlouvou"
          count={leaseCounts.has}
          title="Lokality s nahranou nájemní smlouvou (přílohou)"
        />
        <FilterChip
          active={leaseFilter === "missing"}
          onClick={() => setLeaseFilter((f) => (f === "missing" ? "all" : "missing"))}
          Icon={FileX}
          label="Bez nájemní smlouvy"
          count={leaseCounts.missing}
          title="Lokality bez nahrané nájemní smlouvy"
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-edge" aria-hidden="true" />

        <FilterChip
          active={franchiseFilter === "has"}
          onClick={() => setFranchiseFilter((f) => (f === "has" ? "all" : "has"))}
          Icon={Store}
          label="Franšíza"
          count={franchiseCounts.has}
          title="Lokality s podepsanou franšízingovou smlouvou"
        />
        <FilterChip
          active={franchiseFilter === "missing"}
          onClick={() =>
            setFranchiseFilter((f) => (f === "missing" ? "all" : "missing"))
          }
          Icon={Store}
          label="Bez franšízy"
          count={franchiseCounts.missing}
          title="Lokality bez podepsané franšízingové smlouvy"
        />

        {(activeCats.size > 0 ||
          leaseFilter !== "all" ||
          franchiseFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setActiveCats(new Set());
              setLeaseFilter("all");
              setFranchiseFilter("all");
            }}
            className="ml-1 text-[12px] font-medium text-ink-mid underline-offset-2 hover:text-ink-base hover:underline"
          >
            Zrušit filtr
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-edge bg-paper">
        <ul className="divide-y divide-edge">
          {filtered.map((l) => (
            <li
              key={l.id}
              className="group flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-paper-warm md:flex-row md:items-center md:gap-6 md:px-7 md:py-6"
            >
              <div className="min-w-0 md:flex-1">
                <Link
                  href={`/portal/locations/${l.id}`}
                  className="flex items-baseline gap-3"
                >
                  <span className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink-base">
                    {l.name}
                  </span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-mid">
                  {l.code && <span className="font-mono">{l.code}</span>}
                  <span>{CONCEPT_LABEL[l.concept]}</span>
                  {/* Aktuální klient (obsazeno) má přednost; pak kandidát na
                      převzetí (nový klient); pak cílový franšízant. */}
                  {l.current_client_name && (
                    <span className="truncate text-ink-deep">{l.current_client_name}</span>
                  )}
                  {!l.current_client_name && l.new_client_name && (
                    <span className="truncate text-ink-deep">{l.new_client_name}</span>
                  )}
                  {!l.current_client_name && !l.new_client_name && l.target_franchisee && (
                    <span className="truncate">{l.target_franchisee}</span>
                  )}
                </div>
              </div>

              {/* Franšízový badge - uprostřed řádku (jako ikonky smluv u Klientů). */}
              {franchiseByLocation[l.id] ? (
                <div className="flex items-center md:flex-1 md:justify-center">
                  <Link
                    href={`/portal/contracts/${franchiseByLocation[l.id]}`}
                    title="Franšízingová smlouva - podepsáno"
                    className="grid h-7 w-7 place-items-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 transition-transform hover:-translate-y-0.5"
                  >
                    <Store className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <div className="hidden md:block md:flex-1" />
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                {l.category && (
                  <span className={`${CHIP_BASE} ${CATEGORY_STYLE[l.category]}`}>
                    {CATEGORY_LABEL[l.category]}
                  </span>
                )}
                {l.location_status && (
                  <span className={`${CHIP_BASE} ${LOCATION_STATUS_STYLE[l.location_status]}`}>
                    {LOCATION_STATUS_LABEL[l.location_status]}
                  </span>
                )}
                {l.client_status && (
                  <span className={`${CHIP_BASE} border-edge bg-paper text-ink-mid`}>
                    {CLIENT_STATUS_LABEL[l.client_status]}
                  </span>
                )}
              </div>

              <Link
                href={`/portal/locations/${l.id}`}
                className={`${BTN_ROW} shrink-0`}
              >
                Otevřít
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
