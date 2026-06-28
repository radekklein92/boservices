// Sdílené skeleton bloky pro loading.tsx stránek. Sjednocený vzhled
// (border-edge, bg-edge-warm pulse) napříč portálem. Záměrně nepoužíváme
// klasický shimmer - pulse je tišší a méně rušivý při krátkých čekáních.

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-3 animate-pulse rounded-full bg-edge-warm ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-edge-warm ${className}`}
      aria-hidden="true"
    />
  );
}

// Stránka v stavu načítání - hlavička (eyebrow + title + lede) + content slot.
// Použít jako wrapper v loading.tsx.
export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonLine className="w-28" />
      <SkeletonBlock className="h-10 w-72" />
      <SkeletonLine className="w-[420px] max-w-full" />
    </div>
  );
}

// List rows skeleton - N karet ve sloupci.
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-edge bg-paper">
      <ul className="divide-y divide-edge">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-5 px-7 py-5">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-edge-warm" />
            <div className="flex flex-1 flex-col gap-2">
              <SkeletonLine className="w-1/3" />
              <SkeletonLine className="w-1/2 opacity-60" />
            </div>
            <SkeletonLine className="w-24 opacity-60" />
            <div className="h-9 w-20 animate-pulse rounded-full bg-edge-warm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Grid karet skeleton. cols=3 (default) nebo 2 sloupce na desktop.
export function GridSkeleton({
  cards = 6,
  cols = 3,
}: {
  cards?: number;
  cols?: 2 | 3;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${cols === 3 ? "lg:grid-cols-3" : ""}`}
    >
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonBlock key={i} className="h-44" />
      ))}
    </div>
  );
}

// Search řádek - velký input (h-11) + počet vpravo. Nad listy/tabulkami.
export function SearchBarSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <SkeletonBlock className="h-11 w-full max-w-[420px] rounded-full" />
      <SkeletonLine className="ml-auto w-16 opacity-60" />
    </div>
  );
}

// Řada filtračních pilulek (chips). Šířky střídám, ať to nepůsobí jako mřížka.
export function FilterChipsSkeleton({ count = 6 }: { count?: number }) {
  const widths = ["w-20", "w-28", "w-24", "w-32", "w-20", "w-24", "w-28", "w-16"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={`h-9 ${widths[i % widths.length]} rounded-full`}
        />
      ))}
    </div>
  );
}

// Default page loading - kombinuje header + list.
export function PageLoadingFallback({
  variant = "list",
}: {
  variant?: "list" | "grid" | "detail";
}) {
  return (
    <div className="flex flex-col gap-10">
      <PageHeaderSkeleton />
      {variant === "list" && <ListSkeleton />}
      {variant === "grid" && <GridSkeleton />}
      {variant === "detail" && (
        <div className="flex flex-col gap-5">
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-64" />
        </div>
      )}
    </div>
  );
}
