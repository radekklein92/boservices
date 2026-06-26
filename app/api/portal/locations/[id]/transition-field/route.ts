import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustLocations } from "@/lib/portal/revalidate";
import {
  getLocation,
  setMirroredLocation,
  type MirroredLocation,
} from "@/lib/portal/locations-db";

// Write-through editace vybraných polí lokality. Pole jsou z Transition (zdroj
// pravdy), proto se zapisují TAM přes jeho public PATCH API; po úspěchu se z
// vrácené lokality aktualizuje lokální zrcadlo (aby ji všichni viděli hned, ne
// až po hodinovém syncu). Povolená pole: re_agent, lease_current_status,
// lease_target_status.

const LEASE_VALUES = [
  "uzavrena_na_twist",
  "prepis_na_fransizanta",
  "prepis_jinam",
  "prepis_na_ceip",
  "nemame_reseni",
  "neznamy",
] as const;

const FIELD_VALUES: Record<string, readonly string[]> = {
  re_agent: ["Krampera", "Siarik", "Kholova", "Gransky", "Neuzil"],
  lease_current_status: LEASE_VALUES,
  lease_target_status: LEASE_VALUES,
};

const schema = z.object({
  field: z.enum(["re_agent", "lease_current_status", "lease_target_status"]),
  value: z.string().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed" }, { status: 400 });
  }
  const { field, value } = parsed.data;
  // null = vymazat (re_agent); jinak musí být z povolených hodnot.
  if (value !== null && !FIELD_VALUES[field].includes(value)) {
    return NextResponse.json({ ok: false, error: "Neplatná hodnota" }, { status: 400 });
  }

  const loc = await getLocation(id);
  if (!loc) {
    return NextResponse.json({ ok: false, error: "Lokalita nenalezena" }, { status: 404 });
  }

  const baseUrl = process.env.TRANSITION_LOCATIONS_URL;
  const token = process.env.TRANSITION_API_TOKEN;
  if (!baseUrl || !token) {
    return NextResponse.json(
      { ok: false, error: "Integrace s Transition není nastavená." },
      { status: 503 },
    );
  }

  let txRes: Response;
  try {
    txRes = await fetch(`${baseUrl}/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ field, value, actor: g.session.user!.email }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Transition není dostupný." },
      { status: 502 },
    );
  }

  const txData = (await txRes.json().catch(() => null)) as
    | { ok?: boolean; error?: string; location?: MirroredLocation }
    | null;
  if (!txRes.ok || !txData?.ok) {
    return NextResponse.json(
      { ok: false, error: txData?.error || `Transition vrátil ${txRes.status}` },
      { status: 502 },
    );
  }

  // Write-through: zapsat vrácenou lokalitu do zrcadla (Transition už má novou
  // hodnotu, takže příští full-replace sync je konzistentní).
  const updated = txData.location;
  if (updated?.id) await setMirroredLocation(updated);
  bustLocations();

  return NextResponse.json({
    ok: true,
    field,
    // Autoritativní hodnota z Transition (po případné derivaci).
    value: updated ? updated[field] : value,
  });
}
