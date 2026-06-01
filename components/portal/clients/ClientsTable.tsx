"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Plus,
  Search,
  Trash2,
  Store,
  Handshake,
  Cog,
  Coins,
  FileX2,
  FileText,
  type LucideIcon,
} from "lucide-react";
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
  "in-progress": "border-amber-300 bg-amber-50 text-amber-700",
  signed: "border-emerald-300 bg-emerald-50 text-emerald-700",
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
    });
  } catch {
    return iso;
  }
}

export function ClientsTable({
  clients,
  badgesByClient,
  onAddClick,
  onDeleted,
}: {
  clients: Client[];
  badgesByClient?: Record<string, ClientContractBadge[]>;
  onAddClick?: () => void;
  onDeleted?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
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
    });
  }, [clients, query]);

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
      <div className="rounded-[24px] border border-dashed border-edge bg-paper p-12 text-center">
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
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13.5px] font-semibold text-paper transition-transform active:translate-y-px"
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
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-[400px] flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mid"
            strokeWidth={1.5}
          />
          <input
            type="search"
            placeholder="Hledat podle jména, IČO, města…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full rounded-full border border-edge bg-paper pl-11 pr-4 text-[14px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
          />
        </div>
        <span className="font-mono text-[12px] text-ink-soft">
          {filtered.length.toString().padStart(2, "0")} / {clients.length}
        </span>
      </div>

      {clients.some((c) => (badgesByClient?.[c.id]?.length ?? 0) > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-mid">
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
        </div>
      )}

      <div className="overflow-hidden rounded-[24px] border border-edge bg-paper">
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
                  <span className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink-base">
                    {c.companyName}
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
                    const cls = `grid h-7 w-7 place-items-center rounded-full border ${STATE_STYLE[b.state]}${b.contractId ? " transition-transform hover:-translate-y-0.5" : ""}`;
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
