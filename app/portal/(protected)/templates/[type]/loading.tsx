import {
  PageHeaderSkeleton,
  SkeletonBlock,
} from "@/components/portal/shell/Skeleton";

// Editor šablony = hlavička + jedna velká editační plocha (ne tři volné bloky).
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <SkeletonBlock className="h-[480px] rounded-2xl" />
    </div>
  );
}
