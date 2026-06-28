import {
  PageHeaderSkeleton,
  SkeletonBlock,
} from "@/components/portal/shell/Skeleton";

// Provize = hlavička + box pravidel + dvousloupcový grid karet obchodníků + sekce výběrů.
export default function Loading() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeaderSkeleton />
      <SkeletonBlock className="h-24 rounded-2xl" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <SkeletonBlock className="h-44" />
        <SkeletonBlock className="h-44" />
      </div>
      <SkeletonBlock className="h-64 rounded-2xl" />
    </div>
  );
}
