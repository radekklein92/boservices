"use client";

import { useMemo, useState } from "react";
import { Search, ArrowRight, History } from "lucide-react";
import { Chip } from "@/components/portal/ui/Chip";
import type { LeaseStatus } from "@/lib/portal/locations-db";
import type { LeaseLogEntry } from "@/lib/portal/re-lease-log-db";
import { LEASE_HOLDER_LABEL } from "./real-estate-shared";

// ─────────────────────────────────────────────────────────────────────────────
// Log změn Real Estate pod tabulkou. Newest-first audit pohybů, které hýbou
// počty Řešit/Vyřešeno/Červeně: „Nájem aktuálně"/„Nájem cílově" + příznaky
// „Stejně řešit" (solveDespiteRed) a ruční „Červeně" (manualRed) — co se změnilo,
// z čeho na co, kdy a kdo. Data ze serveru (lib/portal/re-lease-log-db), čistě
// zobrazení + klientské hledání/stránkování.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE = 40;

const FIELD_META: Record<
  LeaseLogEntry["field"],
  { label: string; tone: string }
> = {
  current: {
    label: "Nájem aktuálně",
    tone: "border-edge bg-edge-warm text-ink-mid",
  },
  target: {
    label: "Nájem cílově",
    tone: "border-sky-300 bg-sky-50 text-sky-700",
  },
  solveDespiteRed: {
    label: "Stejně řešit",
    tone: "border-amber-300 bg-amber-50 text-amber-700",
  },
  manualRed: {
    label: "Červeně (ručně)",
    tone: "border-red-300 bg-red-50 text-red-700",
  },
};

// Příznaky (on/off) vs nájem (LeaseStatus): pro zobrazení hodnoty.
const FLAG_FIELDS = new Set<LeaseLogEntry["field"]>(["solveDespiteRed", "manualRed"]);

const dateFmt = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFmt.format(d);
}

// Hodnota záznamu pro zobrazení: nájem → label držitele; příznak → Zapnuto/Vypnuto.
function valueLabel(field: LeaseLogEntry["field"], value: string | null): string {
  if (value == null) return "—";
  if (FLAG_FIELDS.has(field)) return value === "on" ? "Zapnuto" : "Vypnuto";
  return LEASE_HOLDER_LABEL[value as LeaseStatus] ?? value;
}

// Zkrátí strojové „kdo": boservices:e@mail → jméno uživatele (fallback e-mail),
// telegram:Krampera → Telegram · Krampera, system:self-heal → systém (self-heal),
// import:* → import.
function formatBy(by: string, userNames: Record<string, string>): string {
  if (!by) return "neznámý";
  if (by.startsWith("boservices:")) {
    const email = by.slice("boservices:".length);
    return userNames[email.toLowerCase()] ?? email;
  }
  if (by.startsWith("telegram:")) return `Telegram · ${by.slice("telegram:".length)}`;
  if (by.startsWith("system:")) return `systém (${by.slice("system:".length)})`;
  if (by.startsWith("import:")) return "import";
  return by;
}

export function ReLeaseChangeLog({
  entries,
  userNames,
}: {
  entries: LeaseLogEntry[];
  userNames: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.code ?? "").toLowerCase().includes(q),
    );
  }, [entries, query]);

  const visible = filtered.slice(0, shown);

  return (
    <section className="rounded-3xl border border-edge bg-paper">
      <div className="flex flex-col gap-3 border-b border-edge px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2.5">
          <History className="h-4 w-4 text-ink-soft" aria-hidden="true" />
          <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink-base">
            Log změn Real Estate
          </h2>
          <span className="font-mono text-[11px] text-ink-soft">
            {filtered.length}
          </span>
        </div>
        <div className="relative sm:w-64">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mid"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Hledat lokalitu…"
            className="h-9 w-full rounded-full border border-edge bg-paper pl-10 pr-4 text-[13px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
          />
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-ink-soft">
          Zatím žádné zaznamenané změny. Log se plní od svého nasazení — každá
          změna „Nájem aktuálně"/„Nájem cílově" (z tabulky, Telegramu i hodinového
          synchronu z Transition) i přepnutí příznaků „Stejně řešit" a ruční
          „Červeně" se sem propíše.
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-ink-soft">
          Pro „{query}" nic v logu není.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-edge">
            {visible.map((e, i) => {
              const meta = FIELD_META[e.field];
              return (
                <li
                  key={`${e.locationId}-${e.field}-${e.at}-${i}`}
                  className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-paper-warm sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                >
                  <span className="w-32 shrink-0 font-mono text-[11.5px] text-ink-soft">
                    {formatAt(e.at)}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium text-ink-base">
                      {e.name}
                    </span>
                    {e.code ? (
                      <span className="shrink-0 font-mono text-[11px] text-ink-soft">
                        {e.code}
                      </span>
                    ) : null}
                  </span>
                  <Chip tone={meta.tone} className="shrink-0">
                    {meta.label}
                  </Chip>
                  <span className="flex shrink-0 items-center gap-1.5 text-[12.5px]">
                    <span className="text-ink-soft">
                      {valueLabel(e.field, e.from)}
                    </span>
                    <ArrowRight
                      className="h-3.5 w-3.5 text-ink-soft"
                      aria-hidden="true"
                    />
                    <span className="font-medium text-ink-deep">
                      {valueLabel(e.field, e.to)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-mid sm:w-48 sm:text-right">
                    {formatBy(e.by, userNames)}
                  </span>
                </li>
              );
            })}
          </ul>
          {shown < filtered.length ? (
            <div className="border-t border-edge px-5 py-3 text-center">
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE)}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-4 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft"
              >
                Zobrazit další ({filtered.length - shown})
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
