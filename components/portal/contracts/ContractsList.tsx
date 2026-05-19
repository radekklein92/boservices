"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  FileText,
  Plus,
  Search,
  Trash2,
  CheckCircle2,
  ScanLine,
  Circle,
  PenLine,
  Package,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Contract } from "@/lib/portal/contracts-db";
import type { Client } from "@/lib/portal/clients-db";
import { CONTRACT_TYPE_META, isBundleType } from "@/lib/portal/contract-types";
import { ContractCreateModal } from "./ContractCreateModal";

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

const STATUS_ORDER: Contract["status"][] = [
  "draft",
  "generated",
  "signed",
  "picked-up",
  "archived",
];

const STATUS_META: Record<
  Contract["status"],
  { label: string; Icon: LucideIcon; tone: "muted" | "ink" | "ok" }
> = {
  draft: { label: "Koncept", Icon: Circle, tone: "muted" },
  generated: { label: "Vygenerováno", Icon: CheckCircle2, tone: "ink" },
  signed: { label: "Podepsáno", Icon: PenLine, tone: "ink" },
  "picked-up": { label: "Vyzvednuto", Icon: Package, tone: "ink" },
  archived: { label: "Archivováno", Icon: ScanLine, tone: "ok" },
};

type StatusFilter = "all" | Contract["status"];

export function ContractsList({
  contracts,
  clients,
}: {
  contracts: Contract[];
  clients: Client[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(contracts);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState<null | "signed" | "picked-up">(
    null,
  );
  const [bulkToast, setBulkToast] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m: Record<Contract["status"], number> = {
      draft: 0,
      generated: 0,
      signed: 0,
      "picked-up": 0,
      archived: 0,
    };
    for (const c of items) m[c.status]++;
    return m;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.clientName, c.number, CONTRACT_TYPE_META[c.type].fullName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, query, statusFilter]);

  const selectableIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Smazat smlouvu „${name}"? Akce je nevratná.`)) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/portal/contracts/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setItems((prev) => prev.filter((c) => c.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function bulkAction(action: "signed" | "picked-up") {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkPending(action);
    try {
      const res = await fetch("/api/portal/contracts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Hromadná akce selhala.");

      // Refresh items from server
      const listRes = await fetch("/api/portal/contracts");
      const listData = await listRes.json();
      if (listData.ok) setItems(listData.contracts);

      clearSelection();
      const label = action === "signed" ? "Podepsáno" : "Vyzvednuto";
      const skippedMsg = data.skipped
        ? ` · ${data.skipped} přeskočeno (chybí PDF nebo už mají stav)`
        : "";
      setBulkToast(`${label}: ${data.changed} smluv${skippedMsg}`);
      window.setTimeout(() => setBulkToast(null), 4500);
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBulkPending(null);
    }
  }

  if (items.length === 0) {
    return (
      <>
        <div className="rounded-[24px] border border-dashed border-edge bg-paper p-12 text-center">
          <h3 className="text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
            Zatím žádné smlouvy.
          </h3>
          <p className="mt-2 text-[13.5px] text-ink-mid">
            Vytvořte první smlouvu — vyberte klienta a typ.
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={clients.length === 0}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13.5px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-50"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Nová smlouva
          </button>
          {clients.length === 0 && (
            <p className="mt-3 text-[12px] text-ink-mid">
              Nejdřív{" "}
              <Link
                href="/portal/clients"
                className="underline underline-offset-2"
              >
                přidejte klienta
              </Link>
              .
            </p>
          )}
        </div>
        {modalOpen && (
          <ContractCreateModal
            clients={clients}
            onClose={() => setModalOpen(false)}
            onCreated={(id) => {
              setModalOpen(false);
              if (id) router.push(`/portal/contracts/${id}`);
              else router.refresh();
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Search + create */}
        <div className="flex items-center gap-3">
          <div className="relative max-w-[400px] flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mid"
              strokeWidth={1.5}
            />
            <input
              type="search"
              placeholder="Hledat podle klienta, čísla, typu…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-full rounded-full border border-edge bg-paper pl-11 pr-4 text-[14px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
            />
          </div>
          <span className="font-mono text-[12px] text-ink-soft">
            {filtered.length.toString().padStart(2, "0")} / {items.length}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={clients.length === 0}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13.5px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-50"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Nová smlouva
          </button>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            label="Vše"
            count={items.length}
          />
          {STATUS_ORDER.map((s) => {
            const m = STATUS_META[s];
            return (
              <StatusChip
                key={s}
                active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
                Icon={m.Icon}
                label={m.label}
                count={counts[s]}
              />
            );
          })}
        </div>

        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-base bg-ink-base px-5 py-3 text-paper">
            <span className="text-[12.5px] font-medium">
              Vybráno {selected.size}{" "}
              {selected.size === 1 ? "smlouva" : selected.size < 5 ? "smlouvy" : "smluv"}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => bulkAction("signed")}
              disabled={bulkPending !== null}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-paper px-4 text-[12.5px] font-semibold text-ink-base transition-transform active:translate-y-px disabled:opacity-60"
            >
              <PenLine className="h-3.5 w-3.5" strokeWidth={1.5} />
              {bulkPending === "signed" ? "Označuju…" : "Označit jako podepsáno"}
            </button>
            <button
              type="button"
              onClick={() => bulkAction("picked-up")}
              disabled={bulkPending !== null}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-paper px-4 text-[12.5px] font-semibold text-ink-base transition-transform active:translate-y-px disabled:opacity-60"
            >
              <Package className="h-3.5 w-3.5" strokeWidth={1.5} />
              {bulkPending === "picked-up" ? "Označuju…" : "Označit jako vyzvednuto"}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Zrušit výběr"
              className="grid h-9 w-9 place-items-center rounded-full border border-paper/30 text-paper transition-colors hover:bg-paper/10"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        )}

        {bulkToast && (
          <div className="rounded-lg border border-edge bg-paper-warm px-4 py-2.5 text-[12.5px] text-ink-deep">
            {bulkToast}
          </div>
        )}

        {/* List */}
        <div className="overflow-hidden rounded-[24px] border border-edge bg-paper">
          {filtered.length > 0 && (
            <div className="flex items-center gap-3 border-b border-edge bg-paper-warm px-5 py-2.5 md:px-7">
              <label className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mid">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer accent-ink-base"
                />
                Vybrat vše
              </label>
            </div>
          )}
          <ul className="divide-y divide-edge">
            {filtered.map((c) => {
              const meta = CONTRACT_TYPE_META[c.type];
              const statusMeta = STATUS_META[c.status];
              const Icon = statusMeta.Icon;
              const toneClass =
                statusMeta.tone === "muted" ? "text-ink-soft" : "text-ink-base";
              const isSelected = selected.has(c.id);
              return (
                <li
                  key={c.id}
                  className={[
                    "group flex flex-col gap-4 px-5 py-5 transition-colors md:flex-row md:items-center md:gap-5 md:px-7 md:py-5",
                    isSelected ? "bg-paper-warm" : "hover:bg-paper-warm",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(c.id)}
                    aria-label={`Vybrat smlouvu ${c.clientName}`}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-ink-base"
                  />
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-edge bg-paper-warm text-ink-deep">
                    {isBundleType(c.type) ? (
                      <Package className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    ) : (
                      <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/portal/contracts/${c.id}`}
                      className="flex items-baseline gap-3"
                    >
                      <span className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink-base">
                        {c.clientName}
                      </span>
                      <ArrowUpRight
                        className="h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-mid">
                      <span>{meta.fullName}</span>
                      {c.number && (
                        <span className="font-mono text-ink-soft">{c.number}</span>
                      )}
                    </div>
                  </div>
                  <div className={`hidden items-center gap-2 md:flex ${toneClass}`}>
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                    <span className="text-[12px] font-medium uppercase tracking-[0.12em]">
                      {statusMeta.label}
                    </span>
                  </div>
                  <div className="hidden flex-col items-end gap-1 md:flex">
                    <div className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-ink-mid">
                      Vytvořeno
                    </div>
                    <div className="text-[12.5px] text-ink-base">
                      {formatDate(c.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/portal/contracts/${c.id}`}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-edge px-3 text-[12px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
                    >
                      Otevřít
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(c.id, c.clientName)}
                      disabled={busy === c.id}
                      aria-label="Smazat smlouvu"
                      className="grid h-9 w-9 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-base hover:bg-ink-base hover:text-paper disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-7 py-12 text-center text-[13px] text-ink-mid">
                Žádné smlouvy v tomto stavu.
              </li>
            )}
          </ul>
        </div>
      </div>

      {modalOpen && (
        <ContractCreateModal
          clients={clients}
          onClose={() => setModalOpen(false)}
          onCreated={(id) => {
            setModalOpen(false);
            if (id) router.push(`/portal/contracts/${id}`);
            else router.refresh();
          }}
        />
      )}
    </>
  );
}

function StatusChip({
  active,
  onClick,
  Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  Icon?: LucideIcon;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors",
        active
          ? "border-ink-base bg-ink-base text-paper"
          : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
      ].join(" ")}
    >
      {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />}
      <span>{label}</span>
      <span
        className={`font-mono text-[11px] ${active ? "text-paper/70" : "text-ink-soft"}`}
      >
        {count}
      </span>
    </button>
  );
}
