import { notFound } from "next/navigation";
import { cachedGetLocation } from "@/lib/portal/cached-db";
import { LocationDetail } from "@/components/portal/locations/LocationDetail";

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

  return <LocationDetail location={location} />;
}
