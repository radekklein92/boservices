// Skeletony pro per-widget streaming POS dashboardu. Tvarem kopírují reálné
// widgety (KPI grid, graf, boční panel, žebříček, filtr), ať se layout nehýbe,
// když data dostreamují. Tišší pulse (vzor components/portal/shell/Skeleton).

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-edge-warm ${className}`} aria-hidden="true" />;
}
function Line({ className = "" }: { className?: string }) {
  return <div className={`h-3 animate-pulse rounded-full bg-edge-warm ${className}`} aria-hidden="true" />;
}

export function FilterBarSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-edge bg-paper p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Block className="h-9 w-[180px]" />
        <Block className="h-9 w-[180px]" />
        <Block className="ml-auto h-9 w-[120px]" />
        <Block className="h-9 w-[88px]" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Block key={i} className="h-8 w-[92px]" />
        ))}
      </div>
    </div>
  );
}

export function KpiGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl border border-edge bg-paper p-5">
          <Line className="w-24" />
          <Block className="h-8 w-32" />
          <Block className="mt-2 h-8 w-full opacity-50" />
        </div>
      ))}
    </div>
  );
}

export function KpiStripSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl border border-edge bg-paper p-5">
          <Line className="w-20" />
          <Block className="h-7 w-28" />
          <Block className="mt-2 h-7 w-full opacity-50" />
        </div>
      ))}
    </div>
  );
}

export function BarsRowSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <PanelSkeleton rows={5} />
      <PanelSkeleton rows={5} />
      <PanelSkeleton rows={3} />
    </div>
  );
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <Line className="w-40" />
      <div className="rounded-2xl border border-edge bg-paper p-4">
        <div className="animate-pulse rounded-xl bg-edge-warm" style={{ height }} aria-hidden="true" />
      </div>
    </div>
  );
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <Line className="w-28" />
      <div className="flex flex-col gap-2 rounded-2xl border border-edge bg-paper p-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-2 py-3">
            <Line className="w-24" />
            <Line className="w-16 opacity-60" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LeaderboardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <Line className="w-40" />
      <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-edge/60 px-4 py-3 last:border-0">
            <Line className="flex-1" />
            <Line className="w-16 opacity-60" />
            <Block className="h-5 w-14 opacity-50" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Celý rozcestník Přehledu - použito v loading.tsx (přechod na /portal/pos).
// Hlavička + filtr + 4 KPI + graf + panel + žebříček (layout sám už dává rozteč).
export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Line className="w-24" />
        <Block className="h-10 w-48" />
      </div>
      <FilterBarSkeleton />
      <div className="flex flex-col gap-6">
        <KpiStripSkeleton cards={4} />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartSkeleton />
          </div>
          <PanelSkeleton />
        </div>
        <LeaderboardSkeleton />
      </div>
    </div>
  );
}
