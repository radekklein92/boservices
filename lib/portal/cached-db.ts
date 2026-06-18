import { unstable_cache } from "next/cache";
import {
  getContract,
  listContracts,
  listContractsByClient,
} from "./contracts-db";
import { getClient, listClients } from "./clients-db";
import {
  getLocation,
  getLocationsSyncMeta,
  listLocations,
} from "./locations-db";
import { listUsers } from "./users-db";
import {
  getAllTasks,
  listTasksByClient,
  listTasksByContract,
  listTasksByLocation,
} from "./tasks-db";
import { listAllowlist } from "./allowlist-db";
import { getClaimsOverlay } from "./claims-overlay-db";
import {
  getOrSeedContractTemplate,
  listContractTemplates,
} from "./contract-templates-db";
import type { ContractType, ContractVariant } from "./contract-types";
import { TAG } from "./cache-tags";

// Cached read helpery pro server komponenty. Argumenty se automaticky stávají
// součástí cache klíče. Při mutaci volá endpoint revalidateTag(TAG.x) →
// příští read vrátí čerstvá data.
//
// revalidate: 3600 (1h) = nejhorší case TTL. V praxi se invaliduje dřív
// přes revalidateTag, takže to slouží jen jako pojistka pro případ, že by
// někdo zapomněl tag invalidovat.

const ONE_HOUR = 3600;

export const cachedListContracts = unstable_cache(
  () => listContracts(),
  ["cached:listContracts"],
  { tags: [TAG.contracts], revalidate: ONE_HOUR },
);

export const cachedGetContract = unstable_cache(
  (id: string) => getContract(id),
  ["cached:getContract"],
  { tags: [TAG.contracts], revalidate: ONE_HOUR },
);

export const cachedListContractsByClient = unstable_cache(
  (clientId: string) => listContractsByClient(clientId),
  ["cached:listContractsByClient"],
  { tags: [TAG.contracts], revalidate: ONE_HOUR },
);

export const cachedListClients = unstable_cache(
  () => listClients(),
  ["cached:listClients"],
  { tags: [TAG.clients], revalidate: ONE_HOUR },
);

export const cachedGetClient = unstable_cache(
  (id: string) => getClient(id),
  ["cached:getClient"],
  { tags: [TAG.clients], revalidate: ONE_HOUR },
);

export const cachedListUsers = unstable_cache(
  () => listUsers(),
  ["cached:listUsers"],
  { tags: [TAG.users], revalidate: ONE_HOUR },
);

export const cachedListAllowlist = unstable_cache(
  () => listAllowlist(),
  ["cached:listAllowlist"],
  { tags: [TAG.users], revalidate: ONE_HOUR },
);

export const cachedListLocations = unstable_cache(
  () => listLocations(),
  ["cached:listLocations"],
  { tags: [TAG.locations], revalidate: ONE_HOUR },
);

export const cachedGetLocation = unstable_cache(
  (id: string) => getLocation(id),
  ["cached:getLocation"],
  { tags: [TAG.locations], revalidate: ONE_HOUR },
);

export const cachedGetLocationsSyncMeta = unstable_cache(
  () => getLocationsSyncMeta(),
  ["cached:getLocationsSyncMeta"],
  { tags: [TAG.locations], revalidate: ONE_HOUR },
);

export const cachedListTasks = unstable_cache(
  () => getAllTasks(),
  ["cached:listTasks"],
  { tags: [TAG.tasks], revalidate: ONE_HOUR },
);

export const cachedListTasksByClient = unstable_cache(
  (clientId: string) => listTasksByClient(clientId),
  ["cached:listTasksByClient"],
  { tags: [TAG.tasks], revalidate: ONE_HOUR },
);

export const cachedListTasksByLocation = unstable_cache(
  (locationId: string) => listTasksByLocation(locationId),
  ["cached:listTasksByLocation"],
  { tags: [TAG.tasks], revalidate: ONE_HOUR },
);

export const cachedListTasksByContract = unstable_cache(
  (contractId: string) => listTasksByContract(contractId),
  ["cached:listTasksByContract"],
  { tags: [TAG.tasks], revalidate: ONE_HOUR },
);

export const cachedListContractTemplates = unstable_cache(
  () => listContractTemplates(),
  ["cached:listContractTemplates"],
  { tags: [TAG.templates], revalidate: ONE_HOUR },
);

export const cachedGetOrSeedContractTemplate = unstable_cache(
  (type: ContractType, variant?: ContractVariant) =>
    getOrSeedContractTemplate(type, variant),
  ["cached:getOrSeedContractTemplate"],
  { tags: [TAG.templates], revalidate: ONE_HOUR },
);

export const cachedGetClaimsOverlay = unstable_cache(
  () => getClaimsOverlay(),
  ["cached:getClaimsOverlay"],
  { tags: [TAG.claimsOverlay], revalidate: ONE_HOUR },
);
