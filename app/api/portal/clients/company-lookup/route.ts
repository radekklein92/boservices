import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { lookupAres } from "@/lib/portal/ares";
import {
  lookupPolishCompany,
  lookupSlovakCompany,
} from "@/lib/portal/foreign-registers";

const schema = z.object({
  id: z.string().trim().min(1).max(40),
  country: z.string().trim().max(60).optional(),
});

// Načtení firmy z rejstříku podle státu: Polsko = Biała lista (REGON),
// Slovensko = RPO (IČO), jinak ČR = ARES (IČO).
function registerFor(country: string): "pl" | "sk" | "cz" {
  const c = country.toLowerCase();
  if (c.includes("pol")) return "pl";
  if (c.includes("sloven") || c.includes("slovac")) return "sk";
  return "cz";
}

const NOT_FOUND: Record<string, string> = {
  pl: "Firma s tímto REGON se v polském rejstříku (Biała lista) nenašla.",
  sk: "Firma s tímto IČO se ve slovenském rejstříku (RPO) nenašla.",
  cz: "Firma s tímto IČO se v ARES nenašla.",
};

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Zadejte IČO / REGON." },
      { status: 400 },
    );
  }

  const reg = registerFor(parsed.data.country ?? "");
  const result =
    reg === "pl"
      ? await lookupPolishCompany(parsed.data.id)
      : reg === "sk"
        ? await lookupSlovakCompany(parsed.data.id)
        : await lookupAres(parsed.data.id);

  if (!result) {
    return NextResponse.json(
      { ok: false, error: NOT_FOUND[reg] },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, result, register: reg });
}
