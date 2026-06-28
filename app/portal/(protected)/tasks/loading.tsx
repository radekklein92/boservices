import {
  PageHeaderSkeleton,
  SkeletonBlock,
  SearchBarSkeleton,
  ListSkeleton,
} from "@/components/portal/shell/Skeleton";

// Úkoly = hlavička + řada statusových chipů (4) + search + seznam úkolů.
export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-11 rounded-full" />
          ))}
        </div>
        <SearchBarSkeleton />
        <ListSkeleton />
      </div>
    </div>
  );
}
