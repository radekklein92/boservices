import {
  PageHeaderSkeleton,
  SearchBarSkeleton,
  FilterChipsSkeleton,
  ListSkeleton,
} from "@/components/portal/shell/Skeleton";

// Smlouvy = hlavička + search + řada status-filtr chipů + list (ne grid karet).
export default function Loading() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-4">
        <SearchBarSkeleton />
        <FilterChipsSkeleton count={8} />
        <ListSkeleton />
      </div>
    </div>
  );
}
