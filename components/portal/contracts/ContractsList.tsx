"use client";

import { memo, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  FileText,
  Lock,
  LockOpen,
  MapPin,
  Plus,
  Trash2,
  CheckCircle2,
  PenLine,
  Package,
  Gavel,
  Stamp,
  Send,
  Download,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Contract } from "@/lib/portal/contracts-db";
import {
  ALL_CONTRACT_STATUSES,
  canEditContractLock,
  canManageContractLock,
  contractDisplayStatus,
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_STYLE,
  isContractEditable,
} from "@/lib/portal/contracts-db";
import { LockUsersModal } from "./LockUsersModal";
import type { Client } from "@/lib/portal/clients-db";
import dynamicImport from "next/dynamic";
import { CONTRACT_TYPE_META, isBundleType } from "@/lib/portal/contract-types";
import { maskWho } from "@/lib/portal/masked-account";
import { htmlDiff } from "@/lib/portal/contract-diff";
import { bakeSnapshotForDiff } from "@/lib/portal/contract-render";
import { FilterChip } from "@/components/portal/ui/FilterChip";
import { FilterBar } from "@/components/portal/ui/FilterBar";
import { Chip } from "@/components/portal/ui/Chip";
import { EmptyState } from "@/components/portal/ui/EmptyState";
import { CONTRACT_STATUS_ICON } from "./contract-status-meta";
import { BTN_ROW, BTN_ICON, BTN_PRIMARY, BTN_TOOL } from "@/components/portal/ui/buttons";
import { SearchInput } from "@/components/portal/ui/SearchInput";
import { ResultCount } from "@/components/portal/ui/ResultCount";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { XlsxDownloadButton } from "@/components/portal/shared/XlsxDownloadButton";
import { buildContractsXlsx } from "@/lib/portal/contracts-export";

// Hlavička stránky Smlouvy (dřív v page.tsx). Renderuje se tady, aby XLS export
// v akcích měl přístup k client-side odfiltrovanému seznamu (`filtered`).
const CONTRACTS_LEDE =
  "Vygenerujte smlouvu pro klienta, stáhněte PDF a po podpisu nahrajte naskenovanou kopii.";

// Stejná (robustní) logika jako v ContractDetailClient.hasTemplateChanges -
// zda se smlouva odchýlila od šablony. NESMÍ to být naivní templateSnapshot
// !== html: snapshot je v token-formě ({{tokeny}}), html zapečené, takže by se
// vždy lišily a ZMĚNY by svítily i u nezměněných smluv. U ne-bundle proto
// šablonu zapečeme (bakeSnapshotForDiff) a porovnáme přes htmlDiff; bundle je
// na tokenech, porovnává se surově.
function contractHasTemplateChanges(c: Contract): boolean {
  if (isBundleType(c.type)) {
    return (c.bundleSections ?? []).some(
      (s) => !!s.templateSnapshot && htmlDiff(s.templateSnapshot, s.html).hasChanges,
    );
  }
  return (
    !!c.templateSnapshot &&
    htmlDiff(
      bakeSnapshotForDiff(c.templateSnapshot, c.html, c.variables),
      c.html,
    ).hasChanges
  );
}

const ContractCreateModal = dynamicImport(
  () => import("./ContractCreateModal").then((m) => m.ContractCreateModal),
  { ssr: false },
);
const SignerPickerModal = dynamicImport(
  () => import("./SignerPickerModal").then((m) => m.SignerPickerModal),
  { ssr: false },
);
import { KEEP_ORIGINAL_SIGNER } from "./signer-keep-original";

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

const STATUS_ORDER = ALL_CONTRACT_STATUSES;

// Řádek seznamu jako memoizovaná komponenta - při ~180 smlouvách se při výběru/
// filtru re-renderuje jen dotčený řádek, ne celá tabulka. Props jsou primitivní
// a handlery stabilní (useCallback / setState setter), takže memo je účinné.
type ContractRowProps = {
  c: Contract;
  isSelected: boolean;
  isChanged: boolean;
  isBusy: boolean;
  lockBusy: boolean;
  currentUserEmail: string;
  isSuperadmin: boolean;
  onToggle: (id: string) => void;
  onLock: (id: string) => void;
  onRemove: (id: string, name: string) => void;
};

const ContractRow = memo(function ContractRow({
  c,
  isSelected,
  isChanged,
  isBusy,
  lockBusy,
  currentUserEmail,
  isSuperadmin,
  onToggle,
  onLock,
  onRemove,
}: ContractRowProps) {
  const meta = CONTRACT_TYPE_META[c.type];
  // Chip ukazuje ZOBRAZOVANÝ stav (u DigiSign mezistavu „Podepsáno klientem"),
  // konzistentně s osou na detailu. Editovatelnost/zámek dál řeší reálný c.status.
  const displayStatus = contractDisplayStatus(c);
  const StatusIcon = CONTRACT_STATUS_ICON[displayStatus];
  // Uzamčeno pro mě = zámek existuje a nejsem mezi povolenými.
  const lockedForMe =
    !!c.editLock &&
    !canEditContractLock(c.editLock, currentUserEmail, isSuperadmin);
  // Zámek lze nastavovat jen do schválení; spravovat smí zamykatel/superadmin.
  const lockEditable = isContractEditable(c.status);
  const canManageLock = canManageContractLock(
    c.editLock,
    currentUserEmail,
    isSuperadmin,
  );
  const lockByLabel = maskWho(c.editLock?.byName ?? c.editLock?.by ?? "");
  const lockTitle = !c.editLock
    ? "Uzamknout úpravy"
    : lockedForMe
      ? `Uzamčeno: ${lockByLabel} - jen pro čtení`
      : canManageLock
        ? "Uzamčeno - spravovat nebo odemknout"
        : `Uzamčeno: ${lockByLabel} - smíte upravovat`;
  return (
    <li
      className={[
        "group flex flex-col gap-4 px-5 py-5 transition-colors md:flex-row md:items-center md:gap-6 md:px-7 md:py-6",
        isSelected ? "bg-paper-warm" : "hover:bg-paper-warm",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(c.id)}
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
          className="flex items-center gap-3"
        >
          <span className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink-base">
            {c.clientName}
          </span>
          {isChanged && (
            <span
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-warn/30 bg-warn/10 px-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-warn"
              title="Smlouva má změny proti šabloně"
              aria-label="Smlouva má změny proti šabloně"
            >
              <AlertTriangle
                className="h-3 w-3"
                strokeWidth={2.25}
                aria-hidden="true"
              />
              Změny
            </span>
          )}
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
          {c.locationSnapshot?.name && (
            <span className="inline-flex items-center gap-1 text-ink-mid">
              <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              {c.locationSnapshot.name}
            </span>
          )}
        </div>
      </div>
      <Chip tone={CONTRACT_STATUS_STYLE[displayStatus]}>
        <StatusIcon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        {CONTRACT_STATUS_LABEL[displayStatus]}
      </Chip>
      <div className="hidden flex-col items-end gap-1 md:flex">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-ink-mid">
          Vytvořeno
        </div>
        <div className="text-[12.5px] text-ink-base">
          {formatDate(c.createdAt)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/portal/contracts/${c.id}`} className={BTN_ROW}>
          Otevřít
        </Link>
        {lockEditable && (
          <button
            type="button"
            onClick={canManageLock ? () => onLock(c.id) : undefined}
            disabled={!canManageLock || lockBusy}
            aria-label={lockTitle}
            title={lockTitle}
            className={[
              "grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors",
              lockedForMe
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : c.editLock
                  ? "border-ink-base bg-ink-base text-paper"
                  : "border-edge text-ink-mid hover:border-ink-base hover:bg-ink-base hover:text-paper",
              canManageLock ? "" : "cursor-default",
            ].join(" ")}
          >
            {c.editLock ? (
              <Lock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <LockOpen className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(c.id, c.clientName)}
          disabled={isBusy}
          aria-label="Smazat smlouvu"
          className={BTN_ICON}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
});

type BulkAction =
  | "submit"
  | "approve"
  | "pick-signer"
  | "signed"
  | "client-signed"
  | "download-zip";

export function ContractsList({
  contracts,
  clients,
  isApprover = false,
  currentUserEmail = "",
  isSuperadmin = false,
  userOptions = [],
  initialType,
  initialStatuses,
}: {
  contracts: Contract[];
  clients: Client[];
  // Schvalovat smlouvy ve stavu Ke schválení smí jen schvalovatel šablon -
  // ostatním se hromadné tlačítko „Schválit" nezobrazuje.
  isApprover?: boolean;
  // Pro indikaci a správu uživatelského zámku v seznamu.
  currentUserEmail?: string;
  isSuperadmin?: boolean;
  userOptions?: { email: string; name: string }[];
  // Předfiltr z URL (např. proklik z dlaždice na dashboardu): zúžení na typ
  // smlouvy a předvybrané stavy. Validuje server (page.tsx).
  initialType?: Contract["type"];
  initialStatuses?: Contract["status"][];
}) {
  const router = useRouter();
  const [items, setItems] = useState(contracts);
  const [query, setQuery] = useState("");
  // Prázdná množina = bez filtru (Vše). Více vybraných stavů = OR (smlouva
  // projde, je-li v některém z nich) - kombinovatelné filtry jako u Lokalit.
  const [statusFilters, setStatusFilters] = useState<Set<Contract["status"]>>(
    () => new Set(initialStatuses ?? []),
  );
  // Zúžení na typ smlouvy (proklik z dashboardu „Lokality s franšízou"). null =
  // všechny typy. Lze zrušit chipem - tím se přehled vrátí na všechny typy.
  const [typeFilter, setTypeFilter] = useState<Contract["type"] | null>(
    initialType ?? null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState<BulkAction | null>(null);
  const [bulkToast, setBulkToast] = useState<string | null>(null);
  // Datum podpisu klienta pro hromadné „Podepsáno klientem" (kotva poplatků); default dnes.
  const [bulkSignDate, setBulkSignDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [signerPickerOpen, setSignerPickerOpen] = useState(false);
  // Zámek úprav přímo z přehledu: id smlouvy s otevřeným modálem + probíhající uložení.
  const [lockForId, setLockForId] = useState<string | null>(null);
  const [lockBusy, setLockBusy] = useState(false);

  async function setLock(id: string, lock: boolean, allowed: string[]) {
    setLockBusy(true);
    try {
      const res = await fetch(`/api/portal/contracts/${id}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lock, allowed }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      setItems((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, editLock: (data.contract as Contract).editLock } : c,
        ),
      );
      setLockForId(null);
    } catch (err) {
      setBulkToast(err instanceof Error ? err.message : "Chyba");
    } finally {
      setLockBusy(false);
    }
  }

  // Zúžení na typ (proklik z dashboardu). Počty facetů i „Vše" se počítají
  // POUZE z tohoto podsouboru, ať čísla sedí s tím, co je v seznamu vidět.
  const typeScoped = useMemo(
    () => (typeFilter ? items.filter((c) => c.type === typeFilter) : items),
    [items, typeFilter],
  );

  const counts = useMemo(() => {
    const m: Record<Contract["status"], number> = {
      koncept: 0,
      "ke-schvaleni": 0,
      schvaleno: 0,
      "k-podpisu": 0,
      "podepsano-bos": 0,
      "podepsano-klientem": 0,
      archivovano: 0,
      zrusena: 0,
    };
    // Počty i filtr jedou podle ZOBRAZOVANÉHO stavu (jako chip), ať souhlasí
    // číslo u facetu s tím, co je v seznamu vidět - vč. DigiSign mezistavu.
    for (const c of typeScoped) m[contractDisplayStatus(c)]++;
    return m;
  }, [typeScoped]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return typeScoped.filter((c) => {
      if (statusFilters.size > 0 && !statusFilters.has(contractDisplayStatus(c)))
        return false;
      if (!q) return true;
      return [
        c.clientName,
        c.number,
        CONTRACT_TYPE_META[c.type].fullName,
        c.locationSnapshot?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [typeScoped, query, statusFilters]);

  // Změny proti šabloně předpočítáme jednou (htmlDiff není triviální - 180 smluv
  // při každém renderu by sekalo). Set ID smluv, které mají změny.
  const changedIds = useMemo(
    () => new Set(items.filter(contractHasTemplateChanges).map((c) => c.id)),
    [items],
  );

  const selectableIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  // useCallback - stabilní reference, aby memoizovaný ContractRow nere-renderoval
  // při změně nesouvisejícího stavu (jen functional update, žádné deps).
  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  function toggleStatus(s: Contract["status"]) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const remove = useCallback(
    async (id: string, name: string) => {
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
    },
    [router],
  );

  async function bulkStatus(
    action: "submit" | "approve" | "pick-signer" | "signed" | "client-signed",
    extra?: { signerEmail?: string; keepOriginal?: boolean },
  ) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkPending(action);
    try {
      const res = await fetch("/api/portal/contracts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          action,
          ...extra,
          ...(action === "client-signed" ? { signedAt: bulkSignDate } : {}),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Hromadná akce selhala.");

      const listRes = await fetch("/api/portal/contracts");
      const listData = await listRes.json();
      if (listData.ok) setItems(listData.contracts);

      clearSelection();
      const labels: Record<typeof action, string> = {
        submit: "Odesláno ke schválení",
        approve: "Schváleno",
        "pick-signer": "Podepisující přiřazen",
        signed: "Podepsáno BOS",
        "client-signed": "Podepsáno klientem",
      };
      const skippedMsg = data.skipped
        ? ` · ${data.skipped} přeskočeno (už mají stav)`
        : "";
      setBulkToast(`${labels[action]}: ${data.changed} smluv${skippedMsg}`);
      window.setTimeout(() => setBulkToast(null), 4500);
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBulkPending(null);
    }
  }

  async function bulkDownloadZip() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkPending("download-zip");
    try {
      const res = await fetch("/api/portal/contracts/bulk-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Stažení selhalo.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = res.headers.get("X-Filename") ?? "smlouvy.zip";
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBulkToast(`Staženo ${ids.length} smluv jako ZIP.`);
      window.setTimeout(() => setBulkToast(null), 4500);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBulkPending(null);
    }
  }

  async function pickSignerForBulk(email: string) {
    setSignerPickerOpen(false);
    await bulkStatus(
      "pick-signer",
      email === KEEP_ORIGINAL_SIGNER
        ? { keepOriginal: true }
        : { signerEmail: email },
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-10">
        <PageHeader eyebrow="Franšízing" title="Smlouvy" lede={CONTRACTS_LEDE} />
        <EmptyState
          title="Zatím žádné smlouvy."
          description={
            clients.length === 0 ? (
              <>
                Nejdřív{" "}
                <Link href="/portal/clients" className="underline underline-offset-2">
                  přidejte klienta
                </Link>
                , pak vytvořte smlouvu.
              </>
            ) : (
              "Vytvořte první smlouvu - vyberte klienta a typ."
            )
          }
          action={
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={clients.length === 0}
              className={BTN_PRIMARY}
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              Nová smlouva
            </button>
          }
        />
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Franšízing"
        title="Smlouvy"
        lede={CONTRACTS_LEDE}
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={clients.length === 0}
            className={BTN_PRIMARY}
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Nová smlouva
          </button>
        }
      />
      <div className="flex flex-col gap-5">
        {/* Hledání */}
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Hledat podle klienta, čísla, typu, prodejny…"
        />

        {/* Zúžení na typ (proklik z dashboardu) - klik zruší a vrátí všechny typy. */}
        {typeFilter && (
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              active
              onClick={() => setTypeFilter(null)}
              Icon={X}
              label={`Jen: ${CONTRACT_TYPE_META[typeFilter].fullName}`}
              title="Zrušit zúžení na typ - zobrazit všechny typy smluv"
            />
          </div>
        )}

        {/* Status filter chips + počet vpravo */}
        <FilterBar
          trailing={
            <>
              <ResultCount shown={filtered.length} total={typeScoped.length} />
              <XlsxDownloadButton
                className={BTN_TOOL}
                label="Excel"
                iconSize="h-3.5 w-3.5"
                build={() => buildContractsXlsx(filtered)}
                filename={`smlouvy-${new Date().toISOString().slice(0, 10)}.xlsx`}
                disabled={filtered.length === 0}
                title="Stáhne zobrazené smlouvy (vč. dat podpisů, klientů a stavů) do Excelu (.xlsx)"
              />
            </>
          }
        >
          <FilterChip
            active={statusFilters.size === 0}
            onClick={() => setStatusFilters(new Set())}
            label="Vše"
            count={typeScoped.length}
          />
          {STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              active={statusFilters.has(s)}
              onClick={() => toggleStatus(s)}
              Icon={CONTRACT_STATUS_ICON[s]}
              label={CONTRACT_STATUS_LABEL[s]}
              count={counts[s]}
            />
          ))}
        </FilterBar>

        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-base bg-ink-base px-5 py-3 text-paper">
            <span className="text-[12.5px] font-medium">
              Vybráno {selected.size}{" "}
              {selected.size === 1 ? "smlouva" : selected.size < 5 ? "smlouvy" : "smluv"}
            </span>
            <div className="hidden flex-1 sm:block" />
            <BulkButton
              onClick={() => bulkStatus("submit")}
              disabled={bulkPending !== null}
              Icon={Send}
              pending={bulkPending === "submit"}
            >
              Ke schválení
            </BulkButton>
            {isApprover && (
              <BulkButton
                onClick={() => bulkStatus("approve")}
                disabled={bulkPending !== null}
                Icon={CheckCircle2}
                pending={bulkPending === "approve"}
              >
                Schválit
              </BulkButton>
            )}
            <BulkButton
              onClick={() => setSignerPickerOpen(true)}
              disabled={bulkPending !== null}
              Icon={Gavel}
              pending={bulkPending === "pick-signer"}
            >
              Vybrat podepisujícího
            </BulkButton>
            <BulkButton
              onClick={() => bulkStatus("signed")}
              disabled={bulkPending !== null}
              Icon={Stamp}
              pending={bulkPending === "signed"}
            >
              Podepsáno BOS
            </BulkButton>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={bulkSignDate}
                onChange={(e) => setBulkSignDate(e.target.value)}
                aria-label="Datum podpisu klienta"
                title="Datum podpisu klienta (kotva pro výpočet poplatků)"
                className="h-9 rounded-lg border border-edge bg-paper px-2 text-[12.5px] text-ink-base outline-none transition-colors focus:border-ink-base"
              />
              <BulkButton
                onClick={() => bulkStatus("client-signed")}
                disabled={bulkPending !== null}
                Icon={PenLine}
                pending={bulkPending === "client-signed"}
              >
                Podepsáno klientem
              </BulkButton>
            </div>
            <BulkButton
              onClick={bulkDownloadZip}
              disabled={bulkPending !== null}
              Icon={Download}
              pending={bulkPending === "download-zip"}
            >
              Stáhnout ZIP
            </BulkButton>
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
        <div className="overflow-hidden rounded-3xl border border-edge bg-paper">
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
            {filtered.map((c) => (
              <ContractRow
                key={c.id}
                c={c}
                isSelected={selected.has(c.id)}
                isChanged={changedIds.has(c.id)}
                isBusy={busy === c.id}
                lockBusy={lockBusy}
                currentUserEmail={currentUserEmail}
                isSuperadmin={isSuperadmin}
                onToggle={toggleOne}
                onLock={setLockForId}
                onRemove={remove}
              />
            ))}
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

      {signerPickerOpen && (
        <SignerPickerModal
          bulkCount={selected.size}
          onClose={() => setSignerPickerOpen(false)}
          onPicked={pickSignerForBulk}
        />
      )}

      {lockForId &&
        (() => {
          const c = items.find((x) => x.id === lockForId);
          if (!c) return null;
          return (
            <LockUsersModal
              editLock={c.editLock}
              currentUserEmail={currentUserEmail}
              userOptions={userOptions}
              busy={lockBusy}
              onConfirm={(allowed) => setLock(c.id, true, allowed)}
              onUnlock={() => setLock(c.id, false, [])}
              onClose={() => setLockForId(null)}
            />
          );
        })()}
    </div>
  );
}

function BulkButton({
  onClick,
  disabled,
  Icon,
  pending,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  Icon: LucideIcon;
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-2 rounded-full bg-paper px-4 text-[12.5px] font-semibold text-ink-base transition-transform active:translate-y-px disabled:opacity-60"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      {pending ? "Pracuji…" : children}
    </button>
  );
}
