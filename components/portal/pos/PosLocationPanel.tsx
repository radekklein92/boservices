import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSession } from "@/lib/portal/get-session";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { getShopPairsByLocation } from "@/lib/portal/pos/pairing-db";
import { getKpiSummary, resolveDisplayCurrency } from "@/lib/portal/pos/queries";
import { DEFAULT_POS_FILTER, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import type { KpiSummary } from "@/lib/portal/pos/types";
import { formatPosMoney, formatPosNumber } from "./pos-shared";
import { PosDeltaBadge } from "./PosDeltaBadge";

// Mini-panel "Tržby" na detailu lokality. Zobrazí se jen pro role s přístupem do
// Tržeb a jen když má lokalita aspoň jednu napárovanou pokladnu. Výběr zúžený na
// tuto prodejnu -> getKpiSummary sečte všechny její pokladny (rollup).
export async function PosLocationPanel({ locationId }: { locationId: string }) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  if (!isPosApiConfigured()) return null;

  const pairs = await getShopPairsByLocation(locationId);
  if (pairs.length === 0) return null;

  const filter: PosFilter = {
    ...DEFAULT_POS_FILTER,
    preset: "poslednich-30-dni",
    selection: { concepts: [], locations: [locationId] },
  };

  let data: KpiSummary;
  let cur: string;
  try {
    [data, cur] = await Promise.all([getKpiSummary(filter), resolveDisplayCurrency(filter)]);
  } catch {
    return null;
  }

  const c = data.current.find((r) => r.currency === cur) ?? null;
  const p = data.comparison?.find((r) => r.currency === cur) ?? null;
  if (!c) return null;

  const qs = serializePosFilter(filter).toString();
  const detailHref = `/portal/pos/prodejny/${encodeURIComponent(locationId)}${qs ? `?${qs}` : ""}`;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-mid">
          Tržby (posledních 30 dní)
          {pairs.length > 1 && (
            <span className="ml-2 font-normal normal-case tracking-normal text-ink-soft">
              {pairs.length} pokladny
            </span>
          )}
        </h2>
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
        >
          Otevřít v Tržbách
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Tržby (s DPH)" value={formatPosMoney(c.gross, cur)} current={c.gross} previous={p?.gross ?? null} />
        <Stat label="Účtenky" value={formatPosNumber(c.receipts)} current={c.receipts} previous={p?.receipts ?? null} />
        <Stat
          label="Průměrný ticket"
          value={c.avg_ticket != null ? formatPosMoney(c.avg_ticket, cur) : "—"}
          current={c.avg_ticket ?? undefined}
          previous={p?.avg_ticket ?? null}
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  current,
  previous,
}: {
  label: string;
  value: string;
  current?: number;
  previous?: number | null;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-edge bg-paper p-4">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-mid">{label}</div>
      <div className="text-[1.25rem] font-extrabold leading-none tracking-[-0.02em] text-ink-base tabular-nums">
        {value}
      </div>
      {current !== undefined && (
        <PosDeltaBadge current={current} previous={previous ?? null} className="text-[11px]" />
      )}
    </div>
  );
}
