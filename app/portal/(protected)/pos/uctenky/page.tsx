import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { posFilterFromSearchParams, serializePosFilter } from "@/lib/portal/pos/filters";
import { getReceiptsPage } from "@/lib/portal/pos/queries";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { formatLocalDateTime, formatPosMoney, formatPosNumber } from "@/components/portal/pos/pos-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokladna - Účtenky" };

const LIMIT = 50;

export default async function PosReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const sp = await searchParams;
  const filter = posFilterFromSearchParams(sp);
  const rp = Math.max(0, Math.trunc(Number(typeof sp.rp === "string" ? sp.rp : 0)) || 0);
  const cur = filter.currency;
  const useNet = !filter.vatInclusive;

  if (!isPosApiConfigured()) {
    return <Notice title="POS data nejsou nakonfigurovaná" body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel)." />;
  }

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
    return <Notice title="Pro zvolené období nejsou účtenky" body="Zkuste jiné období, značku nebo měnu ve filtru nahoře." />;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-mid">Účtenky</h2>
        <span className="text-[12px] tabular-nums text-ink-mid">{formatPosNumber(total)} celkem · {cur}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/portal/pos/uctenky/${r.id}${filterQs ? `?${filterQs}` : ""}`}
            className="flex items-center gap-3 border-b border-edge/60 px-4 py-3 text-[13px] transition-colors last:border-0 hover:bg-edge-warm"
          >
            <span className="w-[104px] shrink-0 tabular-nums text-ink-mid">{formatLocalDateTime(r.opened_at)}</span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-ink-base">{r.shop_name || "—"}</span>
              {r.is_refund && (
                <span className="shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-600">
                  refundace
                </span>
              )}
            </span>
            <span className="hidden w-[96px] shrink-0 truncate text-right text-[12px] text-ink-soft sm:block">
              {r.channel ?? "—"}
            </span>
            <span className="w-[120px] shrink-0 text-right font-semibold tabular-nums text-ink-base">
              {formatPosMoney(useNet ? r.net : r.gross, r.currency)}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        ))}
      </div>

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
    <Link href={href} className="rounded-lg border border-edge px-3 py-1.5 font-medium text-ink-deep transition-colors hover:bg-edge-warm">
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
