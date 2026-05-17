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
} from "lucide-react";
import type { Contract } from "@/lib/portal/contracts-db";
import type { Client } from "@/lib/portal/clients-db";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";
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

const STATUS_META: Record<
  Contract["status"],
  { label: string; Icon: typeof Circle; tone: "muted" | "ink" | "ok" }
> = {
  draft: { label: "Koncept", Icon: Circle, tone: "muted" },
  generated: { label: "Vygenerováno", Icon: CheckCircle2, tone: "ink" },
  archived: { label: "Archivováno", Icon: ScanLine, tone: "ok" },
};

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
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      [c.clientName, c.number, CONTRACT_TYPE_META[c.type].fullName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

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
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(null);
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

        <div className="overflow-hidden rounded-[24px] border border-edge bg-paper">
          <ul className="divide-y divide-edge">
            {filtered.map((c) => {
              const meta = CONTRACT_TYPE_META[c.type];
              const statusMeta = STATUS_META[c.status];
              const Icon = statusMeta.Icon;
              const toneClass =
                statusMeta.tone === "muted"
                  ? "text-ink-soft"
                  : statusMeta.tone === "ok"
                    ? "text-ink-base"
                    : "text-ink-base";
              return (
                <li
                  key={c.id}
                  className="group flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-paper-warm md:flex-row md:items-center md:gap-6 md:px-7 md:py-5"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-edge bg-paper-warm text-ink-deep">
                    <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
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
