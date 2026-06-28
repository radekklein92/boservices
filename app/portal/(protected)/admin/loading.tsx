import {
  PageHeaderSkeleton,
  SkeletonBlock,
} from "@/components/portal/shell/Skeleton";

// Sdílený fallback pro admin podstránky (changes, pos-pairing, telegram) - všechny
// jsou hlavička + stack sekcí, ne grid karet jako výchozí protected loading.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <SkeletonBlock className="h-40 rounded-2xl" />
      <SkeletonBlock className="h-64 rounded-2xl" />
    </div>
  );
}
