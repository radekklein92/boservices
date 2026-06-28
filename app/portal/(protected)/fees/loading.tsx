import {
  PageHeaderSkeleton,
  SkeletonBlock,
} from "@/components/portal/shell/Skeleton";

// Poplatky = hlavička + řádek stepper/filtrů + velká tabulka.
export default function Loading() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SkeletonBlock className="h-10 w-48 rounded-full" />
          <SkeletonBlock className="h-9 w-64 rounded-full" />
        </div>
        <SkeletonBlock className="h-9 w-80 rounded-full" />
        <SkeletonBlock className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}
