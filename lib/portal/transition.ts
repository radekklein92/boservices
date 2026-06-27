import {
  setMirroredLocation,
  type MirroredLocation,
} from "./locations-db";

// Write-through editace polí lokality, jejichž zdrojem pravdy je Transition. Pole
// se zapíše do Transition (public PATCH API) a z vrácené lokality se aktualizuje
// lokální zrcadlo, aby ho všichni v BOServices viděli hned (ne až po hodinovém
// full-replace syncu). Sdílené mezi PATCH routou (RE agent edituje v tabulce) a
// Telegram webhookem (klik „Vyřešeno" srovná aktuální i cílový nájem). Validaci
// hodnot dělá volající — funkce zapíše, co dostane. NEbustuje cache (revalidate),
// to nechává na volajícím (webhook bustí jednou po obou polích).

export type TransitionField =
  | "re_agent"
  | "lease_current_status"
  | "lease_target_status";

export type TransitionWriteResult =
  | { ok: true; location: MirroredLocation | null }
  | { ok: false; error: string; status: number };

export async function writeTransitionField(
  id: string,
  field: TransitionField,
  value: string | null,
  actor: string,
): Promise<TransitionWriteResult> {
  const baseUrl = process.env.TRANSITION_LOCATIONS_URL;
  const token = process.env.TRANSITION_API_TOKEN;
  if (!baseUrl || !token) {
    return {
      ok: false,
      error: "Integrace s Transition není nastavená.",
      status: 503,
    };
  }

  let txRes: Response;
  try {
    txRes = await fetch(`${baseUrl}/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ field, value, actor }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Transition není dostupný.", status: 502 };
  }

  const txData = (await txRes.json().catch(() => null)) as
    | { ok?: boolean; error?: string; location?: MirroredLocation }
    | null;
  if (!txRes.ok || !txData?.ok) {
    return {
      ok: false,
      error: txData?.error || `Transition vrátil ${txRes.status}`,
      status: 502,
    };
  }

  const updated = txData.location ?? null;
  if (updated?.id) await setMirroredLocation(updated);
  return { ok: true, location: updated };
}
