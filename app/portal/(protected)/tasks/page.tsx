import { TaskManagerClient } from "@/components/portal/tasks/TaskManagerClient";
import type { EntityOption } from "@/components/portal/tasks/types";
import { getSession } from "@/lib/portal/get-session";
import { getSeenMap } from "@/lib/portal/tasks-db";
import {
  cachedListClients,
  cachedListContracts,
  cachedListLocations,
  cachedListTasks,
  cachedListUsers,
} from "@/lib/portal/cached-db";
import { CONTRACT_TYPE_META } from "@/lib/portal/contract-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Úkoly" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const session = await getSession();
  const email = session!.user!.email!;

  const [tasks, users, seenMap, clients, locations, contracts, sp] = await Promise.all([
    cachedListTasks(),
    cachedListUsers(),
    getSeenMap(email),
    cachedListClients(),
    cachedListLocations(),
    cachedListContracts(),
    searchParams,
  ]);

  const members = users.map((u) => ({ name: u.name, email: u.email }));

  const clientOptions: EntityOption[] = clients.map((c) => ({
    id: c.id,
    label: c.companyName,
    sub: c.ico ? `IČO ${c.ico}` : undefined,
  }));
  const locationOptions: EntityOption[] = locations.map((l) => ({
    id: l.id,
    label: l.name,
    sub: l.code ?? undefined,
  }));
  const contractOptions: EntityOption[] = contracts.map((c) => ({
    id: c.id,
    label: `${CONTRACT_TYPE_META[c.type].shortName}${c.number ? ` ${c.number}` : ""}`,
    sub: c.clientName,
  }));

  return (
    <TaskManagerClient
      initialTasks={tasks}
      members={members}
      options={{
        clients: clientOptions,
        locations: locationOptions,
        contracts: contractOptions,
      }}
      initialSeenMap={seenMap}
      initialOpenTaskId={sp.task}
      currentUserName={session!.user!.name ?? ""}
    />
  );
}
