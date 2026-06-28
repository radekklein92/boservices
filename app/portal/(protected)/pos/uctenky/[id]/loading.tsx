import { ReceiptDetailSkeleton } from "@/components/portal/pos/skeletons";

// Detail účtenky je plně async (bez vnitřního Suspense), takže bez tohohle loaderu
// by se ukázal přehledový OverviewSkeleton (filtr + graf) - úplně jiný tvar.
export default function Loading() {
  return <ReceiptDetailSkeleton />;
}
