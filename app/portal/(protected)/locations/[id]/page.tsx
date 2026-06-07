import { notFound } from "next/navigation";
import { cachedGetLocation } from "@/lib/portal/cached-db";
import { LocationDetail } from "@/components/portal/locations/LocationDetail";
import { EntityTasks } from "@/components/portal/tasks/EntityTasks";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const location = await cachedGetLocation(id);
  return { title: location ? location.name : "Lokalita" };
}

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const location = await cachedGetLocation(id);
  if (!location) notFound();

  return (
    <div className="flex flex-col gap-10">
      <LocationDetail location={location} />
      <EntityTasks kind="location" id={id} />
    </div>
  );
}
