import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustLocations } from "@/lib/portal/revalidate";
import { getLocation } from "@/lib/portal/locations-db";
import { writeTransitionField } from "@/lib/portal/transition";

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

  const result = await writeTransitionField(
    id,
    field,
    value,
    g.session.user?.email ?? "portal",
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }
  bustLocations();

  return NextResponse.json({
    ok: true,
    field,
    // Autoritativní hodnota z Transition (po případné derivaci).
    value: result.location ? result.location[field] : value,
  });
}
