import { Suspense } from "react";
import Link from "next/link";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { parsePosFilter, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import { getReceiptsPage } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { PosSubNav } from "@/components/portal/pos/PosSubNav";
import { PosFilterBarLoader } from "@/components/portal/pos/PosFilterBarLoader";
import { FilterBarSkeleton, LeaderboardSkeleton } from "@/components/portal/pos/skeletons";
import { ReceiptsTable } from "@/components/portal/pos/ReceiptsTable";
import { formatPosNumber } from "@/components/portal/pos/pos-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tržby - Účtenky" };

const LIMIT = 50;

function searchParamsToUsp(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") usp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") usp.set(k, v[0]);
  }
  return usp;
}

export default async function PosReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const sp = await searchParams;
  const filter = parsePosFilter(searchParamsToUsp(sp));
  const rp = Math.max(0, Math.trunc(Number(typeof sp.rp === "string" ? sp.rp : 0)) || 0);
  const backQs = serializePosFilter(filter).toString();

  return (
    <>
      <PageHeader
        eyebrow="Provoz"
        title="Účtenky"
        lede="Jednotlivé doklady v rámci výběru a období."
      />
      <PosSubNav />

      <Suspense fallback={<FilterBarSkeleton />}>
        <PosFilterBarLoader filter={filter} />
      </Suspense>
      {!isPosApiConfigured() ? (
        <Notice title="POS data nejsou nakonfigurovaná" body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel)." />
      ) : (
        <Suspense fallback={<LeaderboardSkeleton rows={10} />}>
          <ReceiptsList filter={filter} rp={rp} />
        </Suspense>
      )}
    </>
  );
}

async function ReceiptsList({ filter, rp }: { filter: PosFilter; rp: number }) {
  const useNet = !filter.vatInclusive;
  let data: Awaited<ReturnType<typeof getReceiptsPage>>;
  try {
    data = await getReceiptsPage(filter, rp, { limit: LIMIT });
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst účtenky z API Data Warehouse." />;
  }

  const rows = data.data;
  const total = data.meta.total;
  const filterQs = serializePosFilter(filter).toString();
  const hasNext = (rp + 1) * LIMIT < total;
  const pageHref = (p: number) => {
    const u = new URLSearchParams(filterQs);
    if (p > 0) u.set("rp", String(p));
    const q = u.toString();
    return q ? `/portal/pos/uctenky?${q}` : "/portal/pos/uctenky";
  };

  if (rows.length === 0) {
    return <Notice title="Pro zvolený výběr nejsou účtenky" body="Zkuste jiné období, výběr prodejen nebo měnu ve filtru nahoře." />;
  }

  // Měna z dat (účtenky jdou v efektivní měně výběru, viz queries.ts).
  const cur = rows[0]?.currency ?? filter.currency;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Účtenky</h2>
        <span className="text-[12px] tabular-nums text-ink-mid">
          {formatPosNumber(total)} celkem · {cur}
        </span>
      </div>

      <ReceiptsTable rows={rows} useNet={useNet} filterQs={filterQs} />

      <div className="flex items-center justify-between text-[12.5px]">
        <PageLink href={pageHref(rp - 1)} disabled={rp === 0} label="Předchozí" />
        <span className="tabular-nums text-ink-mid">Strana {rp + 1}</span>
        <PageLink href={pageHref(rp + 1)} disabled={!hasNext} label="Další" />
      </div>
    </section>
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
