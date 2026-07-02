import { revalidateTag } from "next/cache";
import { TAG } from "./cache-tags";

// Tag bust helpery. Volat z mutation endpointů PO úspěšné mutaci.
// Cached* read helpery se obnoví HNED na další request (read-your-writes).
//
// Next.js 16 vyžaduje druhý argument 'profile' u revalidateTag a jeho hodnota
// rozhoduje o tom, jak tvrdá invalidace je:
//   - "max" (a ostatní pojmenované profily) = stale-while-revalidate: tag se jen
//     označí jako "starý", PŘÍŠTÍ request ale ještě dostane stará data a čerstvá
//     se dotáhnou až na pozadí. Důsledek: po editaci je nutné refreshnout dvakrát.
//   - { expire: 0 } = okamžitá (hard) expirace: příští čtení je cache miss a
//     vrátí čerstvá data hned. To je to, co po mutaci chceme.
// (updateTag dělá totéž, ale jde volat jen ze Server Action - naše mutace běží
// v Route Handlerech, takže používáme objektový profil { expire: 0 }.)
const PROFILE = { expire: 0 };

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

export function bustInvoices(): void {
  revalidateTag(TAG.invoices, PROFILE);
}

export function bustReFlags(): void {
  revalidateTag(TAG.reFlags, PROFILE);
}

// POS: párování pobočka<->lokalita se mění z admin UI - po mutaci je nutné
// zneplatnit jak crosswalk, tak odvozené POS agregace (město/koncept scope se
// počítá z párování), proto bustuje obojí.
export function bustPosPairing(): void {
  revalidateTag(TAG.posPairing, PROFILE);
  revalidateTag(TAG.posData, PROFILE);
}

// POS data se běžně nebustují ručně (čerstvost řeší krátké TTL nad API DW);
// tohle je jen pro tlačítko "Obnovit" v UI / výjimečné případy.
export function bustPosData(): void {
  revalidateTag(TAG.posData, PROFILE);
}
