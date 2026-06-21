import { listContractsByClient, statusOrder } from "./contracts-db";

// Má klient uzavřenou (podepsanou) NDA? Vrátí nejnovější podepsanou/archivovanou
// NDA daného klienta, nebo null. Slouží jako tvrdá podmínka před odesláním
// franchise/cooperation/operation smluv k elektronickému podpisu (digisign-send)
// i pro UI gate na detailu smlouvy.
//
// "Uzavřená" = stav alespoň "podepsáno klientem" (DigiSign NDA skončí
// "archivováno", ruční může být "podepsano-klientem") a smlouva není zrušená.
// Vzor: listLocationFranchiseContracts v contracts-db.ts.
export async function getClientSignedNda(
  clientId: string | undefined | null,
): Promise<{ id: string; number?: string } | null> {
  if (!clientId) return null;
  // listContractsByClient vrací smlouvy seřazené dle createdAt sestupně, takže
  // první vyhovující je nejnovější platná NDA.
  const contracts = await listContractsByClient(clientId);
  const threshold = statusOrder("podepsano-klientem");
  const nda = contracts.find(
    (c) =>
      c.type === "nda" &&
      !c.cancelledAt &&
      statusOrder(c.status) >= threshold,
  );
  return nda ? { id: nda.id, number: nda.number } : null;
}
