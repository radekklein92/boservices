import {
  PageHeaderSkeleton,
  SkeletonBlock,
  SearchBarSkeleton,
  FilterChipsSkeleton,
} from "@/components/portal/shell/Skeleton";

// Real Estate = hlavička + dvě souhrnné karty + search + filtr-chipy + velká tabulka.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-28" />
        <SkeletonBlock className="h-28" />
      </div>
      <SearchBarSkeleton />
      <FilterChipsSkeleton count={7} />
      <SkeletonBlock className="h-[480px] rounded-3xl" />
    </div>
  );
}
