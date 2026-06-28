import {
  PageHeaderSkeleton,
  SkeletonBlock,
  SearchBarSkeleton,
  FilterChipsSkeleton,
  ListSkeleton,
} from "@/components/portal/shell/Skeleton";

// Lokality = hlavička + SyncStatus banner + search + řada filtr-chipů + list.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <SkeletonBlock className="h-16 rounded-2xl" />
      <div className="flex flex-col gap-4">
        <SearchBarSkeleton />
        <FilterChipsSkeleton count={10} />
        <ListSkeleton />
      </div>
    </div>
  );
}
