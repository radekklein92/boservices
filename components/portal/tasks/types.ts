// Lehké prezentační typy sdílené mezi server page a klientem (žádný runtime).

export type MemberOption = { name: string; email: string };

// Volba do pickeru navázané entity (klient / lokalita / smlouva).
export type EntityOption = { id: string; label: string; sub?: string };

export type TaskEntityOptions = {
  clients: EntityOption[];
  locations: EntityOption[];
  contracts: EntityOption[];
};
