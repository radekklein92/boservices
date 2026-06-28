import { Suspense } from "react";
import Link from "next/link";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { parsePosFilter, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import { getKpiSummary, getReceiptsPage, resolveDisplayCurrency } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import type { SummaryRow } from "@/lib/portal/pos/types";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { PosSubNav } from "@/components/portal/pos/PosSubNav";
import { PosFilterBarLoader } from "@/components/portal/pos/PosFilterBarLoader";
import { FilterBarSkeleton, LeaderboardSkeleton } from "@/components/portal/pos/skeletons";
import { ReceiptsTable } from "@/components/portal/pos/ReceiptsTable";
import { formatPosMoney, formatPosNumber, formatPct } from "@/components/portal/pos/pos-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tržby - Refundace" };

const LIMIT = 50;

function searchParamsToUsp(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") usp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") usp.set(k, v[0]);
  }
  return usp;
}

function pickRow(rows: SummaryRow[] | null, currency: string): SummaryRow | null {
  return rows?.find((r) => r.currency === currency) ?? null;
}

export default async function PosRefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const sp = await searchParams;
  const filter = parsePosFilter(searchParamsToUsp(sp));
  const rp = Math.max(0, Math.trunc(Number(typeof sp.rp === "string" ? sp.rp : 0)) || 0);

  return (
    <>
      <PageHeader
        eyebrow="Provoz"
        title="Refundace"
        lede="Vrácené doklady v rámci výběru a období - každou refundaci lze rozkliknout do detailu i na původní účtenku."
      />
      <PosSubNav />

      <Suspense fallback={<FilterBarSkeleton />}>
        <PosFilterBarLoader filter={filter} />
      </Suspense>
      {!isPosApiConfigured() ? (
        <Notice title="POS data nejsou nakonfigurovaná" body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel)." />
      ) : (
        <Suspense fallback={<LeaderboardSkeleton rows={8} />}>
          <RefundsContent filter={filter} rp={rp} />
        </Suspense>
      )}
    </>
  );
}

async function RefundsContent({ filter, rp }: { filter: PosFilter; rp: number }) {
  const useNet = !filter.vatInclusive;
  let page: Awaited<ReturnType<typeof getReceiptsPage>>;
  try {
    page = await getReceiptsPage(filter, rp, { limit: LIMIT, refundsOnly: true });
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst refundace z API Data Warehouse." />;
  }

  // Souhrn (objem + podíl) je doplněk - když KPI selže, seznam i počet stojí dál.
  let summary: { amount: number | null; rate: number | null } = { amount: null, rate: null };
  try {
    const [kpi, cur] = await Promise.all([getKpiSummary(filter), resolveDisplayCurrency(filter)]);
    const c = pickRow(kpi.current, cur);
    summary = {
      amount: c?.refund_rate != null ? c.refund_rate * c.gross : null,
      rate: c?.refund_rate ?? null,
    };
  } catch {
    /* necháme jen počet z meta.total */
  }

  const rows = page.data;
  const total = page.meta.total;
  const cur = rows[0]?.currency ?? filter.currency;
  const filterQs = serializePosFilter(filter).toString();
  const hasNext = (rp + 1) * LIMIT < total;
  const pageHref = (p: number) => {
    const u = new URLSearchParams(filterQs);
    if (p > 0) u.set("rp", String(p));
    const q = u.toString();
    return q ? `/portal/pos/refundace?${q}` : "/portal/pos/refundace";
  };

  return (
    <section className="flex flex-col gap-5">
      {/* Souhrnný strip - refundace pod kontrolou na první pohled */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Počet refundací" value={formatPosNumber(total)} />
        <Stat
          label="Objem refundací"
          value={summary.amount != null ? formatPosMoney(summary.amount, cur) : "—"}
          tone={summary.amount != null && summary.amount !== 0 ? "rose" : "default"}
        />
        <Stat label="Podíl na tržbách" value={summary.rate != null ? formatPct(summary.rate) : "—"} />
      </div>

      {rows.length === 0 ? (
        <Notice
          title="Žádné refundace"
          body="Pro zvolený výběr a období nejsou žádné vrácené doklady - nic k řešení."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Vrácené doklady</h2>
            <span className="text-[12px] tabular-nums text-ink-mid">
              {formatPosNumber(total)} celkem · {cur}
            </span>
          </div>

          <ReceiptsTable rows={rows} useNet={useNet} filterQs={filterQs} hideRefundBadge detailExtraQs="from=refundace" />

          <div className="flex items-center justify-between text-[12.5px]">
            <PageLink href={pageHref(rp - 1)} disabled={rp === 0} label="Předchozí" />
            <span className="tabular-nums text-ink-mid">Strana {rp + 1}</span>
            <PageLink href={pageHref(rp + 1)} disabled={!hasNext} label="Další" />
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "rose" | "default";
}) {
  return (
    <div className="rounded-2xl border border-edge bg-paper p-5">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-mid">{label}</div>
      <div
        className={`mt-1.5 truncate text-[1.5rem] font-extrabold leading-[1.05] tracking-[-0.03em] tabular-nums ${
          tone === "rose" ? "text-rose-700" : "text-ink-base"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="rounded-lg border border-edge px-3 py-1.5 text-ink-soft">{label}</span>;
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-edge px-3 py-1.5 font-medium text-ink-deep transition-colors hover:bg-edge-warm"
    >
      {label}
    </Link>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-edge bg-paper p-6">
      <div className="text-[14px] font-semibold text-ink-base">{title}</div>
      <p className="mt-1.5 max-w-[60ch] text-[13px] text-ink-mid">{body}</p>
    </div>
  );
}
