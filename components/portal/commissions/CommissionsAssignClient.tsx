"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Coins, AlertCircle, type LucideIcon } from "lucide-react";
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

// Přiřazování obchodníků ke smlouvám (jen admin). Optimistický toggle + POST na
// vlastní endpoint /salespeople (funguje i na podepsaných smlouvách).
// router.refresh() přepočítá výsledkové karty nad tabulkou (server komponenta).
export function CommissionsAssignClient({
  rows,
}: {
  rows: CommissionContractRow[];
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, SalespersonId[]>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.salespeople])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const franchises = rows.filter((r) => r.type === "franchise");
  const claims = rows.filter((r) => r.type === "claim-bundle");

  return (
    <div className="flex flex-col gap-10">
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-ink-base bg-ink-base px-5 py-4 text-[13px] text-paper">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <AssignSection
        title="Franšízingové smlouvy"
        hint="20 000 Kč za podepsanou franšízu"
        Icon={FileSignature}
        count={franchises.length}
        rows={franchises}
        picks={picks}
        busy={busy}
        onToggle={toggle}
      />
      <AssignSection
        title="Postoupení pohledávek"
        hint="0,1 % z částky u BBI / TD1 / Flowers (vč. ručení)"
        Icon={Coins}
        count={claims.length}
        rows={claims}
        picks={picks}
        busy={busy}
        onToggle={toggle}
      />
    </div>
  );
}

function AssignSection({
  title,
  hint,
  Icon,
  count,
  rows,
  picks,
  busy,
  onToggle,
}: {
  title: string;
  hint: string;
  Icon: LucideIcon;
  count: number;
  rows: CommissionContractRow[];
  picks: Record<string, SalespersonId[]>;
  busy: string | null;
  onToggle: (id: string, sp: SalespersonId) => void;
}) {
  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="flex items-center gap-2 text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
          <Icon className="h-4 w-4 text-ink-mid" strokeWidth={1.5} aria-hidden="true" />
          {title}
        </h2>
        <span className="font-mono text-[12px] text-ink-soft">
          {count.toString().padStart(2, "0")}
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
                busy={busy}
                onToggle={onToggle}
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
  busy,
  onToggle,
}: {
  row: CommissionContractRow;
  picked: SalespersonId[];
  busy: string | null;
  onToggle: (id: string, sp: SalespersonId) => void;
}) {
  const needsAttention = row.signed && picked.length === 0;
  return (
    <li className="flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-paper-warm md:flex-row md:items-center md:gap-6 md:px-7 md:py-6">
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

      <div className="flex items-center gap-2 md:w-[160px] md:justify-end">
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
              disabled={busy !== null}
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
