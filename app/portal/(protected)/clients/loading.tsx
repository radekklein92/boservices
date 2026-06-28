import {
  PageHeaderSkeleton,
  SearchBarSkeleton,
  ListSkeleton,
} from "@/components/portal/shell/Skeleton";

// Klienti = hlavička + search řádek + list (ne čistý list pod hlavičkou).
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-4">
        <SearchBarSkeleton />
        <ListSkeleton />
      </div>
    </div>
  );
}
