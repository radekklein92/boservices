"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPosMoney, formatPosNumber } from "./pos-shared";

// Tabulka top produktů s klikacím celým řádkem -> detail produktu (kde se prodává).
// Stejný vzor jako PosLeaderboard: řádek naviguje, název je <Link> (cmd/ctrl klik
// = nový tab), modifikované kliky necháme prohlížeči.
export interface ProductRow {
  productId: string;
  name: string;
  href: string;
  qty: number;
  value: number; // tržby dle zapnutého DPH
  unit: number | null; // průměrná cena dle DPH
  bar: number; // 0..1 podíl pro vizuální proužek
}

export function PosProductsTable({ rows, currency }: { rows: ProductRow[]; currency: string }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto rounded-2xl border border-edge bg-paper">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-edge text-left text-[11px] uppercase tracking-[0.1em] text-ink-mid">
            <th className="px-4 py-3 font-medium">Produkt</th>
            <th className="px-4 py-3 text-right font-medium">Množství</th>
            <th className="px-4 py-3 text-right font-medium">Tržby</th>
            <th className="px-4 py-3 text-right font-medium">Ø cena</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.productId}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                router.push(r.href);
              }}
              className="cursor-pointer border-b border-edge/60 last:border-0 hover:bg-edge-warm/60"
            >
              <td className="px-4 py-2.5">
                <div className="flex flex-col gap-1">
                  <Link href={r.href} onClick={(e) => e.stopPropagation()} className="font-medium text-ink-base">
                    {r.name || "—"}
                  </Link>
                  <span className="h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-edge">
                    <span
                      className="block h-full rounded-full bg-ink-base"
                      style={{ width: `${Math.max(2, r.bar * 100)}%` }}
                    />
                  </span>
                </div>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-deep">{formatPosNumber(r.qty, 0)}</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-base">
                {formatPosMoney(r.value, currency)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-mid">
                {r.unit != null ? formatPosMoney(r.unit, currency) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
