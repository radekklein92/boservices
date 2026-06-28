import {
  PageHeaderSkeleton,
  GridSkeleton,
} from "@/components/portal/shell/Skeleton";

// Šablony = hlavička + dvousloupcový grid karet (ne tři sloupce).
export default function Loading() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeaderSkeleton />
      <GridSkeleton cards={6} cols={2} />
    </div>
  );
}
