"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileSignature,
  Coins,
  AlertCircle,
  Check,
  X,
  type LucideIcon,
} from "lucide-react";
import { formatCzkRounded } from "@/lib/portal/claims";
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_STYLE,
} from "@/lib/portal/contracts-db";
import {
  SALESPEOPLE,
  type CommissionContractRow,
  type SalespersonId,
} from "@/lib/portal/commissions";

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
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

const contractWord = (n: number) =>
  n === 1 ? "smlouva" : n >= 2 && n <= 4 ? "smlouvy" : "smluv";

// Přiřazování obchodníků ke smlouvám (jen admin). Per-řádek toggle i HROMADNÉ
// přiřazení (zaškrtnutí více smluv + nastavení Toman / Ebermann / oba najednou).
// Vše přes endpointy /salespeople (single) a /salespeople-bulk (více), které
// fungují i na podepsaných smlouvách. router.refresh() přepočítá výsledkové karty.
export function CommissionsAssignClient({
  rows,
}: {
  rows: CommissionContractRow[];
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, SalespersonId[]>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.salespeople])),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPick, setBulkPick] = useState<SalespersonId[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anyBusy = busy !== null || bulkBusy;

  const franchises = useMemo(
    () => rows.filter((r) => r.type === "franchise"),
    [rows],
  );
  const claims = useMemo(
    () => rows.filter((r) => r.type === "claim-bundle"),
    [rows],
  );
  const unassignedIds = useMemo(
    () => rows.filter((r) => (picks[r.id] ?? []).length === 0).map((r) => r.id),
    [rows, picks],
  );

  // Per-řádek toggle jednoho obchodníka.
  async function toggle(id: string, sp: SalespersonId) {
    const current = picks[id] ?? [];
    const next = current.includes(sp)
      ? current.filter((x) => x !== sp)
      : [...current, sp];
    setPicks((p) => ({ ...p, [id]: next }));
    setBusy(`${id}:${sp}`);
    setError(null);
    try {
      const res = await fetch(`/api/portal/contracts/${id}/salespeople`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salespeople: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Uložení selhalo.");
      setPicks((p) => ({ ...p, [id]: data.salespeople as SalespersonId[] }));
      router.refresh();
    } catch (err) {
      setPicks((p) => ({ ...p, [id]: current })); // rollback
      setError(err instanceof Error ? err.message : "Uložení selhalo.");
    } finally {
      setBusy(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setManySelected(ids: string[], value: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkPick([]);
  }

  // Hromadné přiřazení vybraným smlouvám (jeden request).
  async function applyBulk(salespeople: SalespersonId[]) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const prev = Object.fromEntries(ids.map((id) => [id, picks[id] ?? []]));
    setPicks((p) => {
      const next = { ...p };
      for (const id of ids) next[id] = salespeople;
      return next;
    });
    setBulkBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/contracts/salespeople-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, salespeople }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Hromadné uložení selhalo.");
      setSelected(new Set());
      setBulkPick([]);
      router.refresh();
    } catch (err) {
      setPicks((p) => ({ ...p, ...prev })); // rollback
      setError(err instanceof Error ? err.message : "Hromadné uložení selhalo.");
    } finally {
      setBulkBusy(false);
    }
  }

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-ink-base bg-ink-base px-5 py-4 text-[13px] text-paper">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Sticky hromadný panel */}
      <div
        className={[
          "sticky top-3 z-20 rounded-2xl border p-3.5 shadow-[0_12px_30px_-18px_rgba(14,14,14,0.3)] backdrop-blur-sm md:p-4",
          selectedCount > 0 ? "border-ink-base bg-ink-base text-paper" : "border-edge bg-paper/95",
        ].join(" ")}
      >
        {selectedCount === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] text-ink-mid">
              Zaškrtni smlouvy vlevo a přiřaď obchodníka hromadně - lze i oba najednou.
            </span>
            <button
              type="button"
              onClick={() => setManySelected(unassignedIds, true)}
              disabled={unassignedIds.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-base disabled:opacity-50"
            >
              Vybrat vše bez obchodníka ({unassignedIds.length})
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={clearSelection}
                aria-label="Zrušit výběr"
                className="grid h-8 w-8 place-items-center rounded-full border border-paper/30 text-paper/80 transition-colors hover:bg-paper/10"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
              <span className="text-[14px] font-semibold">
                Vybráno {selectedCount} {contractWord(selectedCount)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-paper/70">
                Přiřadit:
              </span>
              {SALESPEOPLE.map((s) => {
                const active = bulkPick.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={bulkBusy}
                    onClick={() =>
                      setBulkPick((bp) =>
                        bp.includes(s.id)
                          ? bp.filter((x) => x !== s.id)
                          : [...bp, s.id],
                      )
                    }
                    aria-pressed={active}
                    className={[
                      "inline-flex h-9 items-center rounded-full border px-3.5 text-[12.5px] font-medium transition-all disabled:opacity-50",
                      active
                        ? "border-paper bg-paper text-ink-base"
                        : "border-paper/40 bg-transparent text-paper hover:border-paper",
                    ].join(" ")}
                  >
                    {s.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => applyBulk(bulkPick)}
                disabled={bulkPick.length === 0 || bulkBusy}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-paper px-4 text-[12.5px] font-semibold text-ink-base transition-transform active:translate-y-px disabled:opacity-40"
              >
                {bulkBusy ? "Ukládám…" : "Použít na vybrané"}
              </button>
              <button
                type="button"
                onClick={() => applyBulk([])}
                disabled={bulkBusy}
                className="inline-flex h-9 items-center rounded-full border border-paper/40 px-3.5 text-[12.5px] font-medium text-paper/90 transition-colors hover:border-paper disabled:opacity-50"
              >
                Odebrat
              </button>
            </div>
          </div>
        )}
      </div>

      <AssignSection
        title="Franšízingové smlouvy"
        hint="20 000 Kč za podepsanou franšízu"
        Icon={FileSignature}
        rows={franchises}
        picks={picks}
        selected={selected}
        busy={busy}
        disabled={anyBusy}
        onToggle={toggle}
        onToggleSelect={toggleSelect}
        onToggleAll={(value) => setManySelected(franchises.map((r) => r.id), value)}
      />
      <AssignSection
        title="Postoupení pohledávek"
        hint="0,1 % z částky u BBI / TD1 / Flowers (vč. ručení)"
        Icon={Coins}
        rows={claims}
        picks={picks}
        selected={selected}
        busy={busy}
        disabled={anyBusy}
        onToggle={toggle}
        onToggleSelect={toggleSelect}
        onToggleAll={(value) => setManySelected(claims.map((r) => r.id), value)}
      />
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={[
        "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors disabled:opacity-40",
        checked
          ? "border-ink-base bg-ink-base text-paper"
          : "border-ink-soft bg-paper text-transparent hover:border-ink-base",
      ].join(" ")}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
    </button>
  );
}

function AssignSection({
  title,
  hint,
  Icon,
  rows,
  picks,
  selected,
  busy,
  disabled,
  onToggle,
  onToggleSelect,
  onToggleAll,
}: {
  title: string;
  hint: string;
  Icon: LucideIcon;
  rows: CommissionContractRow[];
  picks: Record<string, SalespersonId[]>;
  selected: Set<string>;
  busy: string | null;
  disabled: boolean;
  onToggle: (id: string, sp: SalespersonId) => void;
  onToggleSelect: (id: string) => void;
  onToggleAll: (value: boolean) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <Checkbox
          checked={allSelected}
          onChange={() => onToggleAll(!allSelected)}
          disabled={disabled || rows.length === 0}
          label={`Vybrat vše: ${title}`}
        />
        <h2 className="flex items-center gap-2 text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
          <Icon className="h-4 w-4 text-ink-mid" strokeWidth={1.5} aria-hidden="true" />
          {title}
        </h2>
        <span className="font-mono text-[12px] text-ink-soft">
          {rows.length.toString().padStart(2, "0")}
        </span>
        <span className="hidden text-[12px] text-ink-mid md:inline">· {hint}</span>
      </div>
      <div className="overflow-hidden rounded-[24px] border border-edge bg-paper">
        {rows.length === 0 ? (
          <div className="px-7 py-10 text-center text-[13.5px] text-ink-mid">
            Zatím žádné smlouvy.
          </div>
        ) : (
          <ul className="divide-y divide-edge">
            {rows.map((r) => (
              <AssignRow
                key={r.id}
                row={r}
                picked={picks[r.id] ?? []}
                isSelected={selected.has(r.id)}
                busy={busy}
                disabled={disabled}
                onToggle={onToggle}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AssignRow({
  row,
  picked,
  isSelected,
  busy,
  disabled,
  onToggle,
  onToggleSelect,
}: {
  row: CommissionContractRow;
  picked: SalespersonId[];
  isSelected: boolean;
  busy: string | null;
  disabled: boolean;
  onToggle: (id: string, sp: SalespersonId) => void;
  onToggleSelect: (id: string) => void;
}) {
  const needsAttention = row.signed && picked.length === 0;
  return (
    <li
      className={[
        "flex flex-col gap-4 px-5 py-5 transition-colors md:flex-row md:items-center md:gap-5 md:px-6 md:py-5",
        isSelected ? "bg-edge-warm" : "hover:bg-paper-warm",
      ].join(" ")}
    >
      <Checkbox
        checked={isSelected}
        onChange={() => onToggleSelect(row.id)}
        disabled={disabled}
        label={`Vybrat smlouvu ${row.clientName}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink-base">
            {row.clientName || "Bez názvu klienta"}
          </span>
          {row.number && (
            <span className="font-mono text-[12px] text-ink-soft">{row.number}</span>
          )}
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${CONTRACT_STATUS_STYLE[row.status]}`}
          >
            {CONTRACT_STATUS_LABEL[row.status]}
          </span>
          {needsAttention && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
              <AlertCircle className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Chybí obchodník
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-[12.5px] text-ink-mid">
          {row.type === "claim-bundle" && row.debtor ? `Dlužník: ${row.debtor} · ` : ""}
          {row.signed ? `Podepsáno ${formatDate(row.signedAt)}` : "Čeká na podpis"}
        </div>
      </div>

      <div className="flex items-center gap-2 md:w-[150px] md:justify-end">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-soft md:hidden">
          Provize
        </span>
        <span
          className={`text-[14px] font-bold tabular-nums ${row.commission > 0 ? "text-ink-base" : "text-ink-soft"}`}
        >
          {row.signed ? formatCzkRounded(row.commission) : "—"}
        </span>
      </div>

      <div className="flex items-center gap-1.5 md:ml-2 md:w-[200px] md:justify-end">
        {SALESPEOPLE.map((s) => {
          const active = picked.includes(s.id);
          const isBusy = busy === `${row.id}:${s.id}`;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(row.id, s.id)}
              disabled={disabled}
              aria-pressed={active}
              className={[
                "inline-flex h-9 items-center rounded-full border px-3.5 text-[12.5px] font-medium transition-all disabled:opacity-50",
                active
                  ? "border-ink-base bg-ink-base text-paper"
                  : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
              ].join(" ")}
            >
              {isBusy ? "…" : s.name}
            </button>
          );
        })}
      </div>
    </li>
  );
}
