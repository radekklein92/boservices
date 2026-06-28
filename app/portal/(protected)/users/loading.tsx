import {
  PageHeaderSkeleton,
  SkeletonLine,
  ListSkeleton,
} from "@/components/portal/shell/Skeleton";

// Uživatelé = hlavička + dvě titulkové sekce (Aktivní, Pozvánky), každá vlastní list.
export default function Loading() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-4">
        <SkeletonLine className="w-40" />
        <ListSkeleton rows={4} />
      </div>
      <div className="flex flex-col gap-4">
        <SkeletonLine className="w-32" />
        <ListSkeleton rows={2} />
      </div>
    </div>
  );
}
