"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Plus,
  Trash2,
  Store,
  Handshake,
  Cog,
  Coins,
  FileX2,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { TONE_WARN, TONE_GOOD } from "@/lib/portal/tone";
import type { Client } from "@/lib/portal/clients-db";
import {
  CONTRACT_TYPE_META,
  type ContractType,
} from "@/lib/portal/contract-types";
import type {
  ClientContractBadge,
  ContractTypeState,
} from "@/lib/portal/client-contract-status";
import { BTN_ROW, BTN_ICON } from "@/components/portal/ui/buttons";
import { SearchInput } from "@/components/portal/ui/SearchInput";
import { ResultCount } from "@/components/portal/ui/ResultCount";
import { abbreviateLegalForm } from "@/lib/portal/company-name";

const LEGAL_LABEL: Record<string, string> = {
  PO: "Právnická osoba",
  FO: "Fyzická osoba",
};

// Ikona pro typ smlouvy (zobrazuje se jen 5 vytvořitelných typů).
const TYPE_ICON: Partial<Record<ContractType, LucideIcon>> = {
  franchise: Store,
  cooperation: Handshake,
  operation: Cog,
  "claim-bundle": Coins,
  withdrawal: FileX2,
};

// Barva ikonky podle stavu.
const STATE_STYLE: Record<ContractTypeState, string> = {
  planned: "border-edge bg-paper text-ink-soft",
  "in-progress": TONE_WARN,
  signed: TONE_GOOD,
  archived: "border-ink-base bg-ink-base text-paper",
};

const STATE_LABEL: Record<ContractTypeState, string> = {
  planned: "Naplánováno",
  "in-progress": "Vygenerováno",
  signed: "Podepsáno",
  archived: "Archivováno",
};

const STATE_ORDER: ContractTypeState[] = [
  "planned",
  "in-progress",
  "signed",
  "archived",
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Prague",
    });
  } catch {
    return iso;
  }
}

// Fulltext filtr seznamu klientů (jméno, IČO, DIČ, město, e-mail, statutár).
// Sdílené s rodičem (ClientsPageClient), aby XLS export mohl vyexportovat přesně
// to, co je po hledání na stránce vidět.
export function matchClientQuery(c: Client, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    c.companyName,
    c.ico,
    c.dic,
    c.address.city,
    c.contact?.email,
    c.statutory?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function ClientsTable({
  clients,
  filtered,
  query,
  onQueryChange,
  badgesByClient,
  onAddClick,
  onDeleted,
  tableTools,
}: {
  clients: Client[];
  filtered: Client[];
  query: string;
  onQueryChange: (q: string) => void;
  badgesByClient?: Record<string, ClientContractBadge[]>;
  onAddClick?: () => void;
  onDeleted?: () => void;
  tableTools?: ReactNode;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string, name: string) {
    if (!window.confirm(`Smazat klienta ${name}? Tato akce je nevratná.`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/portal/clients/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      onDeleted?.();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusyId(null);
    }
  }

  if (clients.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-edge bg-paper p-12 text-center">
        <h3 className="text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
          Zatím žádní klienti.
        </h3>
        <p className="mt-2 text-[13.5px] text-ink-mid">
          Přidejte prvního klienta — IČO stačí, ARES vyplní zbytek.
        </p>
        {onAddClick && (
          <button
            type="button"
            onClick={onAddClick}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Přidat klienta
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <SearchInput
          value={query}
          onChange={onQueryChange}
          placeholder="Hledat podle jména, IČO, města…"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-mid">
        {clients.some((c) => (badgesByClient?.[c.id]?.length ?? 0) > 0) && (
          <>
            <span className="font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Stav smluv
            </span>
            {STATE_ORDER.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full border ${STATE_STYLE[s]}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                </span>
                {STATE_LABEL[s]}
              </span>
            ))}
          </>
        )}
        <div className="ml-auto flex items-center gap-3">
          <ResultCount shown={filtered.length} total={clients.length} />
          {tableTools}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-edge bg-paper">
        <ul className="divide-y divide-edge">
          {filtered.map((c) => (
            <li
              key={c.id}
              className="group flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-paper-warm md:flex-row md:items-center md:gap-6 md:px-7 md:py-6"
            >
              <div className="min-w-0">
                <Link
                  href={`/portal/clients/${c.id}`}
                  className="flex items-baseline gap-3"
                >
                  <span
                    className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink-base"
                    title={c.companyName}
                  >
                    {abbreviateLegalForm(c.companyName)}
                  </span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </Link>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-mid">
                  {c.ico && <span className="font-mono">IČO {c.ico}</span>}
                  <span>{c.address.city}</span>
                  <span className="text-ink-soft">
                    {LEGAL_LABEL[c.legalForm] ?? c.legalForm}
                  </span>
                </div>
              </div>

              {/* Ikonky stavu smluv - uprostřed řádku, proklik do dané smlouvy. */}
              {(badgesByClient?.[c.id]?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 md:flex-1 md:justify-center">
                  {(badgesByClient?.[c.id] ?? []).map((b, i) => {
                    const Icon = TYPE_ICON[b.type] ?? FileText;
                    const tip = `${CONTRACT_TYPE_META[b.type].shortName} — ${STATE_LABEL[b.state]}`;
                    const cls = `grid h-9 w-9 place-items-center rounded-full border sm:h-7 sm:w-7 ${STATE_STYLE[b.state]}${b.contractId ? " transition-transform hover:-translate-y-0.5" : ""}`;
                    return b.contractId ? (
                      <Link
                        key={i}
                        href={`/portal/contracts/${b.contractId}`}
                        title={tip}
                        className={cls}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                      </Link>
                    ) : (
                      <span key={i} title={tip} className={cls}>
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className="hidden md:block md:flex-1" />
              )}

              <div className="hidden flex-col items-end gap-1 md:flex">
                <div className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-ink-mid">
                  Přidáno
                </div>
                <div className="text-[12.5px] text-ink-base">
                  {formatDate(c.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/portal/clients/${c.id}`} className={BTN_ROW}>
                  Otevřít
                </Link>
                <button
                  type="button"
                  onClick={() => remove(c.id, c.companyName)}
                  disabled={busyId === c.id}
                  aria-label={`Smazat ${c.companyName}`}
                  className={BTN_ICON}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
