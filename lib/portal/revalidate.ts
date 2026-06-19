import { revalidateTag } from "next/cache";
import { TAG } from "./cache-tags";

// Tag bust helpery. Volat z mutation endpointů PO úspěšné mutaci.
// Cached* read helpery se okamžitě obnoví na další request.
//
// Next.js 16 vyžaduje druhý argument 'profile' u revalidateTag. "max" zruší
// všechny vrstvy cache (in-memory + Vercel edge), což je to, co chceme po
// mutaci dat.
const PROFILE = "max";

export function bustContracts(): void {
  revalidateTag(TAG.contracts, PROFILE);
}

export function bustClients(): void {
  revalidateTag(TAG.clients, PROFILE);
  // Smlouvy denormalizují clientName/clientId - když se mění klient,
  // musí se refreshnout i smluvní listy a detaily.
  revalidateTag(TAG.contracts, PROFILE);
}

export function bustUsers(): void {
  revalidateTag(TAG.users, PROFILE);
}

export function bustTemplates(): void {
  revalidateTag(TAG.templates, PROFILE);
}

export function bustLocations(): void {
  revalidateTag(TAG.locations, PROFILE);
}

export function bustTasks(): void {
  revalidateTag(TAG.tasks, PROFILE);
}

export function bustClaimsOverlay(): void {
  revalidateTag(TAG.claimsOverlay, PROFILE);
}

export function bustClamoraClaims(): void {
  revalidateTag(TAG.claimsMirror, PROFILE);
}

export function bustPayouts(): void {
  revalidateTag(TAG.payouts, PROFILE);
}
