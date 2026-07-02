import {
  PageHeaderSkeleton,
  SkeletonBlock,
} from "@/components/portal/shell/Skeleton";

// Fakturace = hlavička + volič měsíce + filtr + tabulka faktur.
export default function Loading() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-4">
        <SkeletonBlock className="h-10 w-48 rounded-full" />
        <SkeletonBlock className="h-9 w-80 rounded-full" />
        <SkeletonBlock className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}
