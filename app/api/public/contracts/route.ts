import { NextResponse } from "next/server";
import {
  listContracts,
  statusOrder,
  clientSignedAtEffective,
} from "@/lib/portal/contracts-db";
import { getClient } from "@/lib/portal/clients-db";

// Read-only veřejné API pro externí konzumenty (Transition) - zrcadlí
// franšízingové smlouvy ve stavu "podepsáno klientem" a vyšším a navíc ty, kde
// klient už podepsal v DigiSign, i když status ještě visí na "k-podpisu" (než
// dopodepíše BOS) - ať si Transition u klientů a lokalit zobrazí "už má
// podepsanou smlouvu" hned, jak ji klient podpisem stvrdil. Zrušené smlouvy se
// nepočítají. Stejný recept jako listLocationFranchiseContracts pro interní badge.
// Protisměrný bratr endpointu /api/public/locations v Transition: stejný
// sdílený bearer token (TRANSITION_API_TOKEN zde = BOSERVICES_SYNC_TOKEN tam).
//
// Endpoint je čistě read-only. Smlouvy se nadále spravují jen tady v BOServices.
// Dokud token není nastaven, vrací 503 (sync na druhé straně to bere jako no-op).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const token = process.env.TRANSITION_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "TRANSITION_API_TOKEN není nastaven." },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization");
  if (header !== `Bearer ${token}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const threshold = statusOrder("podepsano-klientem");
  const signed = (await listContracts()).filter(
    (c) =>
      c.type === "franchise" &&
      !c.cancelledAt &&
      (statusOrder(c.status) >= threshold || !!c.digisignClientSignedAt),
  );

  // Doplnit IČO a jména osob z karty klienta (smlouva nese jen clientId +
  // clientName). Jméno jednatele/kontaktu je klíčové pro párování na klienty
  // v Transition - tam jsou klienti vedeni pod jmény osob, ne firem.
  const clientIds = [...new Set(signed.map((c) => c.clientId))];
  const clients = await Promise.all(clientIds.map((id) => getClient(id)));
  const clientById = new Map(
    clients
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => [c.id, c]),
  );

  return NextResponse.json(
    {
      ok: true,
      count: signed.length,
      syncedAt: new Date().toISOString(),
      contracts: signed.map((c) => {
        const client = clientById.get(c.clientId);
        return {
          id: c.id,
          number: c.number ?? null,
          status: c.status,
          clientId: c.clientId,
          clientName: c.clientName,
          clientIco: client?.ico ?? null,
          statutoryName: client?.statutory?.name ?? null,
          contactName: client?.contact?.name ?? null,
          // locationId je přímo ID lokality z Transition (zrcadlo) - párování
          // na druhé straně je tedy 1:1 bez heuristik.
          locationId: c.locationId ?? null,
          locationName: c.locationSnapshot?.name ?? null,
          clientSignedAt: clientSignedAtEffective(c) ?? null,
        };
      }),
    },
    {
      headers: {
        // Žádné kešování na hraně - sync chce vždy aktuální stav.
        "Cache-Control": "no-store",
      },
    },
  );
}
