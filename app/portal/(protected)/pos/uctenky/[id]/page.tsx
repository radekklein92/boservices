import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { posFilterFromSearchParams, serializePosFilter } from "@/lib/portal/pos/filters";
import { getReceiptDetail, getReceiptShopDisplay } from "@/lib/portal/pos/queries";
import type { ReceiptDetail } from "@/lib/portal/pos/types";
import { formatLocalDateTime } from "@/components/portal/pos/pos-shared";
import { ReceiptDetailView } from "@/components/portal/pos/ReceiptDetailView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokladna - Detail účtenky" };

export default async function PosReceiptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) return null;
  const { id } = await params;
  const sp = await searchParams;
  // ?src=refundace -> doklad jsme otevřeli ze stránky Refundace; vrať se tam (ne na Účtenky).
  // Vlastní param (ne filtrový "from", který nese custom datum) - jinak by kolidovaly.
  const fromRefunds = (typeof sp.src === "string" ? sp.src : undefined) === "refundace";
  const backQs = serializePosFilter(posFilterFromSearchParams(sp)).toString();
  const backBase = fromRefunds ? "/portal/pos/refundace" : "/portal/pos/uctenky";
  const backHref = backQs ? `${backBase}?${backQs}` : backBase;
  const backLabel = fromRefunds ? "Zpět na refundace" : "Zpět na účtenky";

  let r: ReceiptDetail;
  try {
    r = await getReceiptDetail(id);
  } catch {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href={backHref} label={backLabel} />
        <Notice title="Účtenka nenalezena" body="Doklad se nepodařilo načíst z API Data Warehouse." />
      </div>
    );
  }

  // Refundace odkazuje na původní prodejní doklad - proklik na to, co se reálně vrátilo.
  const originalHref = r.original_receipt_id
    ? `/portal/pos/uctenky/${r.original_receipt_id}${backQs ? `?${backQs}` : ""}`
    : null;

  const display = await getReceiptShopDisplay(r.shop_id);
  const title = display.locationName || r.shop_name || "Účtenka";
  const subtitle = [display.city, formatLocalDateTime(r.opened_at), r.source].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={backHref} label={backLabel} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.4rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-base">
            {title}
          </h2>
          <p className="mt-1 text-[13px] text-ink-mid">
            {subtitle}
            {r.channel ? ` · ${r.channel}` : ""}
          </p>
        </div>
        {r.is_refund && (
          <div className="flex flex-col items-end gap-1.5">
            <span className="rounded-md bg-rose-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700">
              Refundace
            </span>
            {originalHref && (
              <Link
                href={originalHref}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base"
              >
                Původní účtenka
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>

      <ReceiptDetailView receipt={r} />
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
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
